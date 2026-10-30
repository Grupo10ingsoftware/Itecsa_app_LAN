export default function FilterIcon({ name, className = '' }) {
  const paths = {
    sliders: <><path d="M3 6h4m6 0h8M3 12h10m6 0h2M3 18h4m6 0h8" /><circle cx="10" cy="6" r="3" /><circle cx="16" cy="12" r="3" /><circle cx="10" cy="18" r="3" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4m8-4v4M4 11h16" /></>,
    chevron: <path d="m6 9 6 6 6-6" />,
  }
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>
}
