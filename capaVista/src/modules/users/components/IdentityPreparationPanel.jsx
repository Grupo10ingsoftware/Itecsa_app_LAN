import UserCreateForm from './UserCreateForm.jsx'

export default function IdentityPreparationPanel() {
  return (
    <section className="card p-3 my-3" aria-labelledby="preparation-title">
      <h2 id="preparation-title" className="h4">Preparar una cuenta</h2>
      <UserCreateForm />
    </section>
  )
}
