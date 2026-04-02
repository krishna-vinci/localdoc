import { getDeviceShareRequests, getDeviceShares, getDevices, getSyncHealth } from "@/lib/api"

import { DeviceManagement } from "./device-management"

export default async function DevicesPage() {
  const [devices, syncHealth] = await Promise.all([getDevices(), getSyncHealth()])

  const sharesByDeviceEntries = await Promise.all(
    devices.map(async (device) => [device.id, await getDeviceShares(device.id)] as const)
  )
  const shareRequestsByDeviceEntries = await Promise.all(
    devices.map(async (device) => [device.id, await getDeviceShareRequests(device.id)] as const)
  )

  return (
    <DeviceManagement
      initialDevices={devices}
      initialSyncHealth={syncHealth}
      initialSharesByDevice={Object.fromEntries(sharesByDeviceEntries)}
      initialShareRequestsByDevice={Object.fromEntries(shareRequestsByDeviceEntries)}
      initialRenderedAt={new Date().toISOString()}
    />
  )
}
