import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import styles from './Layout.module.css'
import ModuleLoadingState from '../navigation/ModuleLoadingState'

function AppLayout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isSidebarHovered, setIsSidebarHovered] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const sidebarRef = useRef(null)
  const mobileMenuButtonRef = useRef(null)
  const pointerInsideSidebar = useRef(false)

  function handleToggleSidebar() {
    // The expand button pins a temporary hover opening; the next click closes it.
    setIsSidebarHovered(false)
    setIsSidebarCollapsed((currentValue) => !currentValue)
  }

  function handleSidebarPointerEnter(event) {
    if (event.pointerType !== 'mouse' || pointerInsideSidebar.current) return
    pointerInsideSidebar.current = true
    if (isSidebarCollapsed && window.matchMedia('(min-width: 992px) and (hover: hover) and (pointer: fine)').matches) {
      setIsSidebarHovered(true)
    }
  }

  function handleSidebarPointerLeave(event) {
    if (event.pointerType !== 'mouse') return
    pointerInsideSidebar.current = false
    setIsSidebarHovered(false)
  }

  function handleOpenMobileSidebar() {
    setIsMobileSidebarOpen(true)
  }

  const handleCloseMobileSidebar = useCallback(() => {
    setIsMobileSidebarOpen(false)
  }, [])

  useEffect(() => {
    if (isSidebarCollapsed && !isSidebarHovered && !isMobileSidebarOpen) return

    function closeExpandedSidebar() {
      // Keep the desktop preference intact while the mobile drawer is hidden.
      if (window.matchMedia('(max-width: 991.98px)').matches) {
        if (isMobileSidebarOpen) handleCloseMobileSidebar()
      } else if (!isSidebarCollapsed || isSidebarHovered) {
        setIsSidebarHovered(false)
        setIsSidebarCollapsed(true)
      }
    }

    function handlePointerDown(event) {
      // The desktop toggle is inside the sidebar; the mobile opener is outside.
      if (sidebarRef.current?.contains(event.target) || mobileMenuButtonRef.current?.contains(event.target)) return
      closeExpandedSidebar()
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') closeExpandedSidebar()
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [isSidebarCollapsed, isSidebarHovered, isMobileSidebarOpen, handleCloseMobileSidebar])

  return (
    <div className={styles.appShell}>
      <aside
        ref={sidebarRef}
        onPointerEnter={handleSidebarPointerEnter}
        onPointerLeave={handleSidebarPointerLeave}
        id="main-sidebar"
        className={`
          ${styles.sidebar}
          ${isSidebarCollapsed && !isSidebarHovered ? styles.sidebarCollapsed : ''}
          ${isMobileSidebarOpen ? styles.sidebarMobileOpen : ''}
        `}
      >
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          onCloseMobile={handleCloseMobileSidebar}
          onToggleCollapse={handleToggleSidebar}
        />
      </aside>

      {isMobileSidebarOpen && (
        <button
          aria-label="Cerrar menú lateral"
          className={styles.mobileBackdrop}
          onClick={handleCloseMobileSidebar}
          type="button"
        />
      )}

      <section
        className={`
          ${styles.contentArea}
          ${isSidebarCollapsed ? styles.contentAreaSidebarCollapsed : ''}
        `}
      >
        <Topbar onOpenMobileSidebar={handleOpenMobileSidebar} isMobileSidebarOpen={isMobileSidebarOpen} mobileMenuButtonRef={mobileMenuButtonRef} />
        <main className={styles.mainContent}>
          <Suspense fallback={<ModuleLoadingState />}>
            <Outlet />
          </Suspense>
        </main>
      </section>
    </div>
  )
}

export default AppLayout
