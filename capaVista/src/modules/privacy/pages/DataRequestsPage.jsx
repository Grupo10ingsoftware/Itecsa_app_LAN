import LoadingIndicator from '../../../shared/components/loading/LoadingIndicator'
import { useAuth } from '../../../hooks/useAuth'
import DataRequestForm from '../components/DataRequestForm'
import RequestTypesPanel from '../components/RequestTypesPanel'
import PrivacyPageHeader from '../components/PrivacyPageHeader'
import { usePrivacyApi } from '../hooks/usePrivacyApi'
import { usePrivacyDocuments } from '../hooks/usePrivacyDocuments'
import styles from './PrivacyPages.module.css'
import PageShell from '../../../shared/components/layout/PageShell'

export default function DataRequestsPage() {
  const { user } = useAuth()
  const api = usePrivacyApi()
  const { loading, error, requestsEnabled, retry } = usePrivacyDocuments(api)
  return <PageShell className={styles.page} aria-label="Solicitudes sobre mis datos">
    <PrivacyPageHeader title="SOLICITUDES SOBRE MIS DATOS" />
    <p className="mt-3 mb-0 text-secondary">La solicitud será revisada por el área responsable y recibirás una respuesta por correo electrónico.</p>
    {loading && <LoadingIndicator context="Comprobando disponibilidad del canal" />}
    {error && <div className="alert alert-danger mt-3" role="alert">{error} <button className="btn btn-outline-dark btn-sm" type="button" onClick={retry}>Reintentar</button></div>}
    {!loading && !error && <div className={styles.requestsGrid}>
      <DataRequestForm email={user?.email ?? ''} sendRequest={api.sendRequest} enabled={requestsEnabled} />
      <RequestTypesPanel />
    </div>}
  </PageShell>
}
