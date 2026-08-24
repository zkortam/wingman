import { ConfigWorkspace } from '../../../src/features/config/ConfigWorkspace'
import { config } from '../../../src/server/container'
import { operatorIdentity } from '../../../src/server/operator-identity'
import { PageHeader } from '../../../src/ui/PageHeader'
import { ServiceUnavailable } from '../../../src/features/status/ServiceUnavailable'

export const dynamic = 'force-dynamic'

export default async function ConfigPage() {
  let identity: ReturnType<typeof operatorIdentity>
  let versions: Awaited<ReturnType<typeof config.listVersions>>
  let reporter: Awaited<ReturnType<typeof config.resolve>>
  try {
    identity = operatorIdentity()
    versions = await config.listVersions(identity.agentId)
    reporter = await config.resolve(identity.agentId, identity.userHash)
  } catch {
    return <ServiceUnavailable resource="Configuration" />
  }
  return (
    <>
      <PageHeader title="Config" meta="Immutable versions and per-user overrides" />
      <ConfigWorkspace
        {...identity}
        initialOverrideActive={reporter.version > 1}
        versions={versions.map((version) => ({
          id: version.id,
          version: version.version,
          incidentId: version.incidentId,
          ...('config' in version ? { config: version.config } : {}),
        }))}
      />
    </>
  )
}
