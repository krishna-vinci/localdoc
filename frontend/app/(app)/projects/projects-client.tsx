"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Layers3, Loader2, Plus, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { AppAlert } from "@/components/shared/app-alert"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import {
  SectionPanel,
  SectionPanelContent,
  SectionPanelDescription,
  SectionPanelHeader,
  SectionPanelTitle,
} from "@/components/shared/section-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { createProject, deleteProject, getProjects } from "@/lib/api"
import { formatDate } from "@/lib/format"
import type { Project } from "@/types"

export function ProjectsClient({ initialProjects }: { initialProjects: Project[] }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [color, setColor] = useState("")
  const [metadataRules, setMetadataRules] = useState("")
  const [defaultTemplate, setDefaultTemplate] = useState("")

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: getProjects,
    initialData: initialProjects,
    initialDataUpdatedAt: 0,
  })

  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] })
      setOpen(false)
      setName("")
      setDescription("")
      setColor("")
      setMetadataRules("")
      setDefaultTemplate("")
      toast.success("Project created")
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to create project"),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] })
      toast.success("Project deleted")
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to delete project"),
  })

  const sortedProjects = useMemo(
    () => [...(projectsQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [projectsQuery.data]
  )

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Structure"
        title="Projects"
        description="Define long-lived workspaces for your notes. Keep the surface simple, and reveal rules or templates only when you need them."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
              render={
                <Button>
                  <Plus className="size-4" />
                  New project
                </Button>
              }
            />
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create project</DialogTitle>
                <DialogDescription>Name the workspace first. The rest is optional and can stay minimal.</DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium">Name</span>
                  <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Engineering docs" />
                </label>

                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium">Description</span>
                  <Textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What belongs in this workspace?"
                    className="min-h-24"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">Color token</span>
                  <Input value={color} onChange={(event) => setColor(event.target.value)} placeholder="slate / blue / moss" />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">Metadata rules</span>
                  <Textarea
                    value={metadataRules}
                    onChange={(event) => setMetadataRules(event.target.value)}
                    placeholder='{"required": ["status", "owner"]}'
                    className="min-h-24"
                  />
                </label>

                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium">Default template</span>
                  <Textarea
                    value={defaultTemplate}
                    onChange={(event) => setDefaultTemplate(event.target.value)}
                    placeholder={"---\nstatus: draft\n---\n\n# New note"}
                    className="min-h-32 font-mono text-xs"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2">
                <DialogClose>Cancel</DialogClose>
                <Button
                  disabled={createMutation.isPending || !name.trim()}
                  onClick={() =>
                    createMutation.mutate({
                      name: name.trim(),
                      description: description.trim() || null,
                      color: color.trim() || null,
                      metadata_rules: metadataRules.trim() || null,
                      default_template: defaultTemplate.trim() || null,
                    })
                  }
                >
                  {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Create project
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {projectsQuery.isError ? (
        <AppAlert variant="error">{projectsQuery.error instanceof Error ? projectsQuery.error.message : "Failed to load projects"}</AppAlert>
      ) : null}

      <SectionPanel>
        <SectionPanelHeader>
          <SectionPanelTitle>Workspace list</SectionPanelTitle>
          <SectionPanelDescription>Keep projects readable and lightweight. Add extra rules only where they provide real value.</SectionPanelDescription>
        </SectionPanelHeader>
        <SectionPanelContent>
          {projectsQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-28 animate-pulse rounded-[1.5rem] border border-border/70 bg-muted/40" />
              ))}
            </div>
          ) : sortedProjects.length === 0 ? (
            <EmptyState
              icon={Layers3}
              title="No projects yet"
              description="Create a workspace for the parts of your library that deserve their own identity, rules, or templates."
            />
          ) : (
            <div className="space-y-3">
              {sortedProjects.map((project) => (
                <div key={project.id} className="rounded-[1.5rem] border border-border/70 bg-background/80 px-5 py-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 space-y-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold tracking-tight">{project.name}</h3>
                          <Badge variant="secondary">{project.folder_count} folder{project.folder_count === 1 ? "" : "s"}</Badge>
                          {project.color ? <Badge variant="outline">{project.color}</Badge> : null}
                        </div>
                        {project.description ? <p className="text-sm text-muted-foreground">{project.description}</p> : null}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>Created {formatDate(project.created_at)}</span>
                        {project.metadata_rules ? <Badge variant="outline">Rules configured</Badge> : null}
                        {project.default_template ? <Badge variant="outline">Template configured</Badge> : null}
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(`Delete project “${project.name}”?`)) {
                          deleteMutation.mutate(project.id)
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      aria-label={`Delete ${project.name}`}
                    >
                      {deleteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionPanelContent>
      </SectionPanel>
    </div>
  )
}
