import LegalDocumentCard from '../components/LegalDocumentCard'
import PrivacyPageHeader from '../components/PrivacyPageHeader'
import { usePrivacyApi } from '../hooks/usePrivacyApi'
import { usePrivacyDocuments } from '../hooks/usePrivacyDocuments'
import styles from './PrivacyPages.module.css'
import PageShell from '../../../shared/components/layout/PageShell'

const DOCUMENTS = [
  { id: 'notice', title: 'Aviso de privacidad', description: 'Conoce cómo recopilamos, utilizamos, protegemos y tratamos tus datos personales, de acuerdo con la normativa vigente.', icon: 'bi-file-earmark-text', action: 'Ver documento' },
  { id: 'terms', title: 'Términos y condiciones', description: 'Consulta las condiciones de uso de ItecsaApp, los derechos y responsabilidades de los usuarios, y las disposiciones generales del servicio.', icon: 'bi-file-earmark-text', action: 'Ver documento' },
  { id: 'policy', title: 'Política de tratamiento de datos', description: 'Información detallada sobre el tratamiento de tus datos personales, las finalidades, bases legales y tus derechos como titular.', icon: 'bi-shield', action: 'Ver documento' },
  { id: 'procedure', title: 'Procedimiento para solicitudes', description: 'Conoce el proceso para ejercer tus derechos relacionados con tus datos personales y realizar cualquier solicitud relacionada con tus datos.', icon: 'bi-folder', action: 'Consultar' },
]

export default function DocumentsPage() {
  const api = usePrivacyApi()
  const { documents, loading, error, retry } = usePrivacyDocuments(api)
  return <PageShell className={styles.page} aria-label="Documentos de privacidad">
    <PrivacyPageHeader title="LEGAL Y PRIVACIDAD" />
    {loading && <p role="status" className="mt-3">Cargando documentos…</p>}
    {error && <div className="alert alert-danger mt-3" role="alert">{error} <button className="btn btn-outline-dark btn-sm" type="button" onClick={retry}>Reintentar</button></div>}
    {!loading && !error && <div className={styles.documentsGrid}>{DOCUMENTS.map(item => <LegalDocumentCard key={item.id} {...item} document={documents.find(document => document.id === item.id)} />)}</div>}
  </PageShell>
}
