import { getFolders, getProjects, getWatchStatuses } from "@/lib/api"

import { FoldersClient } from "@/app/(app)/folders/folders-client"

export default async function ManageFoldersPage() {
  const [folders, projects, watchStatuses] = await Promise.all([
    getFolders(),
    getProjects(),
    getWatchStatuses(),
  ])

  return (
    <FoldersClient
      initialFolders={folders}
      initialProjects={projects}
      initialWatchStatuses={watchStatuses}
    />
  )
}
