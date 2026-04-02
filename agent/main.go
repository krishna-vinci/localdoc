package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	pathpkg "path"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

var agentVersion = "0.1.0"

type Config struct {
	ServerURL   string       `json:"server_url"`
	DeviceID    string       `json:"device_id"`
	DeviceToken string       `json:"device_token"`
	DisplayName string       `json:"display_name"`
	Hostname    string       `json:"hostname"`
	Platform    string       `json:"platform"`
	Shares      []AgentShare `json:"shares"`
}

type AgentShare struct {
	ID           string                   `json:"id"`
	DisplayName  string                   `json:"display_name"`
	SourcePath   string                   `json:"source_path"`
	IncludeGlobs []string                 `json:"include_globs"`
	ExcludeGlobs []string                 `json:"exclude_globs"`
	SyncEnabled  bool                     `json:"sync_enabled"`
	Manifest     map[string]manifestEntry `json:"manifest,omitempty"`
}

type manifestEntry struct {
	SizeBytes int64  `json:"size_bytes"`
	MTimeNS   int64  `json:"mtime_ns"`
	SHA256    string `json:"sha256"`
}

type enrollRequest struct {
	EnrollmentToken string `json:"enrollment_token"`
	DisplayName     string `json:"display_name"`
	Hostname        string `json:"hostname,omitempty"`
	Platform        string `json:"platform,omitempty"`
	AgentVersion    string `json:"agent_version,omitempty"`
}

type authResponse struct {
	DeviceID    string `json:"device_id"`
	DeviceToken string `json:"device_token"`
	Status      string `json:"status"`
}

type shareUpsertRequest struct {
	ID           string   `json:"id,omitempty"`
	DisplayName  string   `json:"display_name"`
	SourcePath   string   `json:"source_path"`
	IncludeGlobs []string `json:"include_globs"`
	ExcludeGlobs []string `json:"exclude_globs"`
	SyncEnabled  bool     `json:"sync_enabled"`
}

type shareResponse struct {
	ID string `json:"id"`
}

type agentConfigResponse struct {
	Shares []AgentShare `json:"shares"`
}

type heartbeatRequest struct {
	DisplayName  string `json:"display_name,omitempty"`
	Hostname     string `json:"hostname,omitempty"`
	Platform     string `json:"platform,omitempty"`
	AgentVersion string `json:"agent_version,omitempty"`
}

type snapshotRequest struct {
	BatchID      string `json:"batch_id"`
	GenerationID string `json:"generation_id"`
}

type batchEntry struct {
	Op         string `json:"op"`
	Path       string `json:"path"`
	SizeBytes  int64  `json:"size_bytes,omitempty"`
	MTimeNS    int64  `json:"mtime_ns,omitempty"`
	SHA256     string `json:"sha256,omitempty"`
	ContentB64 string `json:"content_b64,omitempty"`
}

type batchRequest struct {
	BatchID      string       `json:"batch_id"`
	GenerationID string       `json:"generation_id,omitempty"`
	Entries      []batchEntry `json:"entries"`
}

type trackedFile struct {
	RelativePath string
	SizeBytes    int64
	MTimeNS      int64
	SHA256       string
	ContentB64   string
	Changed      bool
}

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	switch os.Args[1] {
	case "pair":
		must(runPair(os.Args[2:]))
	case "add-share":
		must(runAddShare(os.Args[2:]))
	case "sync-once":
		must(runSyncOnce())
	case "run":
		must(runLoop(os.Args[2:]))
	case "show-config":
		must(showConfig())
	default:
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println("LocalDocs thin agent")
	fmt.Println("Commands:")
	fmt.Println("  pair --server URL --token TOKEN [--name NAME]")
	fmt.Println("  add-share --path PATH [--name NAME] [--include GLOB] [--exclude GLOB]")
	fmt.Println("  sync-once")
	fmt.Println("  run [--interval-seconds 30]")
	fmt.Println("  show-config")
}

func must(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func configFilePath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	path := filepath.Join(dir, "localdocs-agent")
	if err := os.MkdirAll(path, 0o755); err != nil {
		return "", err
	}
	return filepath.Join(path, "config.json"), nil
}

func loadConfig() (*Config, error) {
	path, err := configFilePath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func saveConfig(cfg *Config) error {
	path, err := configFilePath()
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

func defaultDisplayName() string {
	host, _ := os.Hostname()
	if host == "" {
		host = "local-device"
	}
	return host
}

func runPair(args []string) error {
	fs := flag.NewFlagSet("pair", flag.ContinueOnError)
	server := fs.String("server", "http://localhost:4320", "Central LocalDocs URL")
	token := fs.String("token", "", "Enrollment token")
	name := fs.String("name", defaultDisplayName(), "Device display name")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *token == "" {
		return errors.New("--token is required")
	}
	host, _ := os.Hostname()
	payload := enrollRequest{
		EnrollmentToken: *token,
		DisplayName:     *name,
		Hostname:        host,
		Platform:        runtime.GOOS,
		AgentVersion:    agentVersion,
	}
	var resp authResponse
	if err := doJSON(http.MethodPost, strings.TrimRight(*server, "/")+"/api/v1/sync/agents/enroll", "", payload, &resp); err != nil {
		return err
	}
	cfg := &Config{
		ServerURL:   strings.TrimRight(*server, "/"),
		DeviceID:    resp.DeviceID,
		DeviceToken: resp.DeviceToken,
		DisplayName: *name,
		Hostname:    host,
		Platform:    runtime.GOOS,
		Shares:      []AgentShare{},
	}
	if err := saveConfig(cfg); err != nil {
		return err
	}
	fmt.Println("paired device", resp.DeviceID)
	return nil
}

func runAddShare(args []string) error {
	cfg, err := loadConfig()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}
	fs := flag.NewFlagSet("add-share", flag.ContinueOnError)
	path := fs.String("path", "", "Source path to sync")
	name := fs.String("name", "", "Display name")
	include := fs.String("include", "", "Optional comma-separated include globs")
	exclude := fs.String("exclude", "", "Optional comma-separated exclude globs")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *path == "" {
		return errors.New("--path is required")
	}
	shareName := *name
	if shareName == "" {
		shareName = filepath.Base(*path)
	}
	share := AgentShare{
		DisplayName:  shareName,
		SourcePath:   *path,
		IncludeGlobs: splitList(*include),
		ExcludeGlobs: splitList(*exclude),
		SyncEnabled:  true,
	}
	if err := upsertShareRemote(cfg, &share); err != nil {
		return err
	}
	updated := false
	for i, existing := range cfg.Shares {
		if existing.ID == share.ID || existing.SourcePath == share.SourcePath {
			cfg.Shares[i] = share
			updated = true
			break
		}
	}
	if !updated {
		cfg.Shares = append(cfg.Shares, share)
	}
	if err := saveConfig(cfg); err != nil {
		return err
	}
	fmt.Println("share configured", share.DisplayName, share.ID)
	return nil
}

func showConfig() error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	encoded, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(encoded))
	return nil
}

func runLoop(args []string) error {
	fs := flag.NewFlagSet("run", flag.ContinueOnError)
	intervalSeconds := fs.Int("interval-seconds", 30, "Full sync interval in seconds")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *intervalSeconds < 5 {
		return errors.New("interval must be at least 5 seconds")
	}
	for {
		if err := runSyncOnce(); err != nil {
			fmt.Fprintln(os.Stderr, "sync error:", err)
		}
		time.Sleep(time.Duration(*intervalSeconds) * time.Second)
	}
}

func runSyncOnce() error {
	cfg, err := loadConfig()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}
	if len(cfg.Shares) == 0 {
		fmt.Println("no shares configured; skipping sync")
		return nil
	}
	if err := sendHeartbeat(cfg); err != nil {
		return err
	}
	if err := syncRemoteConfig(cfg); err != nil {
		return err
	}
	for i := range cfg.Shares {
		if !cfg.Shares[i].SyncEnabled {
			continue
		}
		if cfg.Shares[i].ID == "" {
			if err := upsertShareRemote(cfg, &cfg.Shares[i]); err != nil {
				return err
			}
		}
		if err := syncShare(cfg, &cfg.Shares[i]); err != nil {
			if len(cfg.Shares[i].Manifest) == 0 {
				return err
			}
			cfg.Shares[i].Manifest = nil
			if retryErr := syncShare(cfg, &cfg.Shares[i]); retryErr != nil {
				return retryErr
			}
		}
	}
	return saveConfig(cfg)
}

func sendHeartbeat(cfg *Config) error {
	payload := heartbeatRequest{
		DisplayName:  cfg.DisplayName,
		Hostname:     cfg.Hostname,
		Platform:     cfg.Platform,
		AgentVersion: agentVersion,
	}
	return doJSON(http.MethodPost, cfg.ServerURL+"/api/v1/sync/agents/heartbeat", cfg.DeviceToken, payload, nil)
}

func upsertShareRemote(cfg *Config, share *AgentShare) error {
	payload := shareUpsertRequest{
		ID:           share.ID,
		DisplayName:  share.DisplayName,
		SourcePath:   share.SourcePath,
		IncludeGlobs: share.IncludeGlobs,
		ExcludeGlobs: share.ExcludeGlobs,
		SyncEnabled:  share.SyncEnabled,
	}
	var resp shareResponse
	if err := doJSON(http.MethodPost, cfg.ServerURL+"/api/v1/sync/agents/shares/upsert", cfg.DeviceToken, payload, &resp); err != nil {
		return err
	}
	share.ID = resp.ID
	return nil
}

func syncRemoteConfig(cfg *Config) error {
	var resp agentConfigResponse
	if err := doJSON(http.MethodGet, cfg.ServerURL+"/api/v1/sync/agents/config", cfg.DeviceToken, nil, &resp); err != nil {
		return err
	}
	localByID := make(map[string]AgentShare, len(cfg.Shares))
	localUnsynced := make([]AgentShare, 0)
	for _, share := range cfg.Shares {
		if share.ID == "" {
			localUnsynced = append(localUnsynced, share)
			continue
		}
		localByID[share.ID] = share
	}
	nextShares := make([]AgentShare, 0, len(resp.Shares)+len(localUnsynced))
	for _, remoteShare := range resp.Shares {
		if localShare, ok := localByID[remoteShare.ID]; ok && len(localShare.Manifest) > 0 {
			remoteShare.Manifest = localShare.Manifest
		}
		nextShares = append(nextShares, remoteShare)
	}
	nextShares = append(nextShares, localUnsynced...)
	cfg.Shares = nextShares
	return nil
}

func syncShare(cfg *Config, share *AgentShare) error {
	files, nextManifest, err := collectFiles(share)
	if err != nil {
		return err
	}
	generationID := fmt.Sprintf("gen-%d", time.Now().UnixNano())
	if err := doJSON(http.MethodPost, fmt.Sprintf("%s/api/v1/sync/agents/shares/%s/snapshot/start", cfg.ServerURL, share.ID), cfg.DeviceToken, snapshotRequest{
		BatchID:      fmt.Sprintf("batch-start-%d", time.Now().UnixNano()),
		GenerationID: generationID,
	}, nil); err != nil {
		return err
	}

	const batchSize = 50
	for start := 0; start < len(files); start += batchSize {
		end := start + batchSize
		if end > len(files) {
			end = len(files)
		}
		entries := make([]batchEntry, 0, end-start)
		for _, file := range files[start:end] {
			entry := batchEntry{
				Op:        "present",
				Path:      file.RelativePath,
				SizeBytes: file.SizeBytes,
				MTimeNS:   file.MTimeNS,
				SHA256:    file.SHA256,
			}
			if file.Changed {
				entry.Op = "upsert"
				entry.ContentB64 = file.ContentB64
			}
			entries = append(entries, batchEntry{
				Op:         entry.Op,
				Path:       entry.Path,
				SizeBytes:  entry.SizeBytes,
				MTimeNS:    entry.MTimeNS,
				SHA256:     entry.SHA256,
				ContentB64: entry.ContentB64,
			})
		}
		if err := doJSON(http.MethodPost, fmt.Sprintf("%s/api/v1/sync/agents/shares/%s/batch", cfg.ServerURL, share.ID), cfg.DeviceToken, batchRequest{
			BatchID:      fmt.Sprintf("batch-%d-%d", time.Now().UnixNano(), start),
			GenerationID: generationID,
			Entries:      entries,
		}, nil); err != nil {
			return err
		}
	}

	if err := doJSON(http.MethodPost, fmt.Sprintf("%s/api/v1/sync/agents/shares/%s/snapshot/complete", cfg.ServerURL, share.ID), cfg.DeviceToken, snapshotRequest{
		BatchID:      fmt.Sprintf("batch-complete-%d", time.Now().UnixNano()),
		GenerationID: generationID,
	}, nil); err != nil {
		return err
	}
	share.Manifest = nextManifest
	return nil
}

func collectFiles(share *AgentShare) ([]trackedFile, map[string]manifestEntry, error) {
	root := filepath.Clean(share.SourcePath)
	files := []trackedFile{}
	nextManifest := make(map[string]manifestEntry)
	err := filepath.Walk(root, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() {
			if strings.HasPrefix(info.Name(), ".") && path != root {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(info.Name(), ".md") && !strings.HasSuffix(info.Name(), ".markdown") {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		if !matchesGlobs(rel, share.IncludeGlobs, share.ExcludeGlobs) {
			return nil
		}
		previous, hasPrevious := share.Manifest[rel]
		currentManifestEntry := manifestEntry{SizeBytes: info.Size(), MTimeNS: info.ModTime().UnixNano()}
		tracked := trackedFile{
			RelativePath: rel,
			SizeBytes:    currentManifestEntry.SizeBytes,
			MTimeNS:      currentManifestEntry.MTimeNS,
		}
		if hasPrevious && previous.SizeBytes == currentManifestEntry.SizeBytes && previous.MTimeNS == currentManifestEntry.MTimeNS {
			tracked.SHA256 = previous.SHA256
			nextManifest[rel] = manifestEntry{
				SizeBytes: currentManifestEntry.SizeBytes,
				MTimeNS:   currentManifestEntry.MTimeNS,
				SHA256:    previous.SHA256,
			}
			files = append(files, tracked)
			return nil
		}
		content, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		hash := sha256.Sum256(content)
		tracked.SHA256 = hex.EncodeToString(hash[:])
		tracked.ContentB64 = base64.StdEncoding.EncodeToString(content)
		tracked.Changed = true
		nextManifest[rel] = manifestEntry{
			SizeBytes: currentManifestEntry.SizeBytes,
			MTimeNS:   currentManifestEntry.MTimeNS,
			SHA256:    tracked.SHA256,
		}
		files = append(files, tracked)
		return nil
	})
	if err != nil {
		return nil, nil, err
	}
	sort.Slice(files, func(i, j int) bool { return files[i].RelativePath < files[j].RelativePath })
	return files, nextManifest, nil
}

func matchesGlobs(path string, include, exclude []string) bool {
	allowed := true
	if len(include) > 0 {
		allowed = false
		for _, pattern := range include {
			if matchPattern(pattern, path) {
				allowed = true
				break
			}
		}
	}
	if !allowed {
		return false
	}
	for _, pattern := range exclude {
		if matchPattern(pattern, path) {
			return false
		}
	}
	return true
}

func matchPattern(pattern, path string) bool {
	pattern = strings.TrimSpace(strings.ReplaceAll(pattern, "\\", "/"))
	path = strings.TrimSpace(strings.ReplaceAll(path, "\\", "/"))
	if pattern == "" {
		return false
	}
	if strings.Contains(pattern, "**") {
		if prefix, suffix, ok := strings.Cut(pattern, "/**/"); ok {
			prefix = strings.Trim(prefix, "/")
			suffix = strings.Trim(suffix, "/")
			if prefix != "" && !strings.HasPrefix(path, prefix+"/") && path != prefix {
				return false
			}
			if suffix == "" {
				return true
			}
			if strings.Contains(suffix, "/") {
				idx := strings.Index(path, "/")
				if idx >= 0 && idx+1 < len(path) {
					if ok, _ := pathpkg.Match(suffix, path[idx+1:]); ok {
						return true
					}
				}
			}
			if ok, _ := pathpkg.Match(suffix, pathpkg.Base(path)); ok {
				return true
			}
			return strings.HasSuffix(path, strings.TrimPrefix(suffix, "*"))
		}
		trimmed := strings.ReplaceAll(pattern, "**/", "")
		trimmed = strings.ReplaceAll(trimmed, "/**", "")
		trimmed = strings.ReplaceAll(trimmed, "**", "")
		trimmed = strings.Trim(trimmed, "/")
		if strings.HasPrefix(pattern, "**/") && strings.HasPrefix(trimmed, "*.") {
			return strings.HasSuffix(path, strings.TrimPrefix(trimmed, "*"))
		}
		if strings.HasSuffix(pattern, "/**") {
			return strings.Contains(path, trimmed) && (path == trimmed || strings.HasPrefix(path, trimmed+"/") || strings.Contains(path, "/"+trimmed+"/"))
		}
		if strings.Contains(trimmed, "*") {
			parts := strings.Split(trimmed, "/")
			if len(parts) == 2 && strings.HasPrefix(parts[1], "*.") {
				return strings.HasPrefix(path, parts[0]+"/") && strings.HasSuffix(path, strings.TrimPrefix(parts[1], "*"))
			}
		}
	}
	if ok, _ := pathpkg.Match(pattern, path); ok {
		return true
	}
	if !strings.Contains(pattern, "/") {
		if ok, _ := pathpkg.Match(pattern, pathpkg.Base(path)); ok {
			return true
		}
	}
	return false
}

func splitList(value string) []string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func doJSON(method, url, deviceToken string, payload any, out any) error {
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(encoded)
	}
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if deviceToken != "" {
		req.Header.Set("X-LocalDocs-Device-Token", deviceToken)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode >= 400 {
		var payload map[string]any
		if err := json.Unmarshal(respBody, &payload); err == nil {
			if detail, ok := payload["detail"].(string); ok {
				return errors.New(detail)
			}
		}
		return fmt.Errorf("request failed: %s", resp.Status)
	}
	if out != nil {
		return json.Unmarshal(respBody, out)
	}
	return nil
}
