import PrivacyPageHeader from '../../privacy/components/PrivacyPageHeader'
import common from '../../privacy/pages/PrivacyPages.module.css'
import IncidentReportForm from '../components/IncidentReportForm'
import IncidentTypesPanel from '../components/IncidentTypesPanel'
import { useIncidentReportsApi } from '../hooks/useIncidentReportsApi'
import { useIncidentConfiguration } from '../hooks/useIncidentConfiguration'
import PageShell from '../../../shared/components/layout/PageShell'

export default function IncidentReportPage() {
  const api = useIncidentReportsApi()
  const { loading, error, reportsEnabled, contactEmail, retry } = useIncidentConfiguration(api)
  return <PageShell className={common.page} aria-label="Reportar incidente">
    <PrivacyPageHeader title="REPORTAR INCIDENTE" />
    <div className={common.requestsGrid}>
      <IncidentReportForm email={contactEmail} sendReport={api.submit} enabled={!loading && !error && reportsEnabled} checking={loading} configurationError={error} retryConfiguration={retry} />
      <IncidentTypesPanel />
    </div>
  </PageShell>
}
