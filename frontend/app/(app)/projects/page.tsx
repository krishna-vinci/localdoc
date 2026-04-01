"use client"

import { Layers3, Loader2, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { createProject, deleteProject, getProjects } from "@/lib/api"
import type { Project } from "@/types"

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Record<string, boolean>>({})

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [color, setColor] = useState("")
  const [metadataRules, setMetadataRules] = useState("")
  const [defaultTemplate, setDefaultTemplate] = useState("")

  const loadProjects = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setProjects(await getProjects())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  async function handleCreate() {
    if (!name.trim()) return
    setCreating(true)
    setError(null)
    try {
      const project = await createProject({
        name: name.trim(),
        description: description.trim() || null,
        color: color.trim() || null,
        metadata_rules: metadataRules.trim() || null,
        default_template: defaultTemplate.trim() || null,
      })
      setProjects((prev) => [...prev, project].sort((a, b) => a.name.localeCompare(b.name)))
      setName("")
      setDescription("")
      setColor("")
      setMetadataRules("")
      setDefaultTemplate("")
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project")
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting((prev) => ({ ...prev, [id]: true }))
    try {
      await deleteProject(id)
      setProjects((prev) => prev.filter((project) => project.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete project")
    } finally {
      setDeleting((prev) => ({ ...prev, [id]: false }))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Group folders into long-lived workspaces with optional rules and templates.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button>
                <Plus className="size-4 mr-1.5" />
                Add Project
              </Button>
            }
          />
          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Create Project</DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Engineering Docs" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-20 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  placeholder="What this project contains"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Color token</label>
                <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="slate / indigo / teal" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Metadata rules (optional)</label>
                <textarea
                  value={metadataRules}
                  onChange={(e) => setMetadataRules(e.target.value)}
                  className="min-h-24 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  placeholder='{"required":["status","owner"]}'
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Default template (optional)</label>
                <textarea
                  value={defaultTemplate}
                  onChange={(e) => setDefaultTemplate(e.target.value)}
                  className="min-h-28 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  placeholder={"---\nstatus: draft\n---\n\n# New Note"}
                />
              </div>

              <div className="flex justify-end gap-2">
                <DialogClose>Cancel</DialogClose>
                <Button disabled={creating || !name.trim()} onClick={handleCreate}>
                  {creating && <Loader2 className="size-4 mr-1.5 animate-spin" />}
                  Create Project
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <Layers3 className="mx-auto mb-3 size-8 opacity-40" />
          <p className="text-sm">No projects yet.</p>
          <p className="text-xs mt-1">Create one to organize folders into a workspace.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((project) => (
            <Card key={project.id}>
              <CardContent className="py-4 px-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2 min-w-0">
                    <div>
                      <p className="text-sm font-medium">{project.name}</p>
                      {project.description && (
                        <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>{project.folder_count} folder{project.folder_count === 1 ? "" : "s"}</span>
                      {project.color && <span>Color: {project.color}</span>}
                      {project.metadata_rules && <span>Metadata rules configured</span>}
                      {project.default_template && <span>Default template configured</span>}
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="self-end sm:self-auto"
                    aria-label={`Delete ${project.name}`}
                    onClick={() => void handleDelete(project.id)}
                    disabled={deleting[project.id]}
                  >
                    {deleting[project.id] ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
