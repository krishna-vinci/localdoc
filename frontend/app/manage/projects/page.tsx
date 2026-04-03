import { getProjects } from "@/lib/api"

import { ProjectsClient } from "@/app/(app)/projects/projects-client"

export default async function ManageProjectsPage() {
  const projects = await getProjects()

  return <ProjectsClient initialProjects={projects} />
}
