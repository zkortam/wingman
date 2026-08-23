import { ConfigWorkspace } from '../../../src/features/config/ConfigWorkspace'
import { DEMO_AGENT, DEMO_REPORTER_HASH } from '../../../src/domain/demo'
import { config } from '../../../src/server/container'
import { PageHeader } from '../../../src/ui/PageHeader'

export const dynamic = 'force-dynamic'

export default async function ConfigPage() {
  const [versions, reporter] = await Promise.all([
    config.listVersions(),
    config.resolve(DEMO_AGENT, DEMO_REPORTER_HASH),
  ])
  return (
    <>
      <PageHeader title="Config" meta="Immutable versions and per-user overrides" />
      <ConfigWorkspace initialOverrideActive={reporter.version > 1} versions={versions} />
    </>
  )
}
