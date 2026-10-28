import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import NotificationBell from './NotificationBell'
const state=vi.hoisted(()=>({api:null,play:vi.fn(),info:vi.fn(),error:vi.fn()}))
vi.mock('../hooks/useMessagesApi',()=>({useMessagesApi:()=>state.api}))
vi.mock('../hooks/useMessageSound',()=>({useMessageSound:()=>state.play}))
vi.mock('../../../shared/notifications/useToast',()=>({useToast:()=>({info:state.info,error:state.error})}))
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
const snapshot=(ids=[1],revision='r1')=>({notifications:ids.map(id=>({id_mensaje:id,Asunto:'Subject '+id,preview:'Private excerpt',truncated:false,fecha_publicacion:'2026-01-01'})),unreadCount:ids.length,revision})
let scope=0
beforeEach(()=>{vi.clearAllMocks();Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});state.api={scopeId:++scope,getNotifications:vi.fn().mockResolvedValue(snapshot()),hideNotification:vi.fn().mockResolvedValue({}),clearNotifications:vi.fn().mockResolvedValue({hiddenCount:1})}})
afterEach(()=>{cleanup();vi.useRealTimers()})
const mount=()=>render(<MemoryRouter><NotificationBell/><Routes><Route path="/" element={null}/><Route path="/mensajes/:messageId" element={<p>Authorized detail</p>}/></Routes></MemoryRouter>)
it('unchanged polls retain the list and do not repeat toasts/sound; opening shortly after a read avoids another GET',async()=>{
 vi.useFakeTimers();state.api.getNotifications.mockResolvedValueOnce(snapshot()).mockResolvedValue({unchanged:true,revision:'r1',unreadCount:1});mount();
 await act(()=>vi.advanceTimersByTimeAsync(0));fireEvent.click(screen.getByRole('button',{name:/Notificaciones/}));
 expect(state.api.getNotifications).toHaveBeenCalledTimes(1);expect(screen.getByText('Subject 1')).toBeTruthy();
 await act(()=>vi.advanceTimersByTimeAsync(5000));expect(state.api.getNotifications.mock.calls[1][1]).toMatchObject({compact:true,revision:'r1'});
 expect(screen.getByText('Subject 1')).toBeTruthy();expect(state.info).not.toHaveBeenCalled();expect(state.play).not.toHaveBeenCalled();
})
it('same count but different IDs produces one generic toast/sound for the new message',async()=>{
 vi.useFakeTimers();state.api.getNotifications.mockResolvedValueOnce(snapshot()).mockResolvedValue(snapshot([2],'r2'));mount();await act(()=>vi.advanceTimersByTimeAsync(5000));
 expect(state.info).toHaveBeenCalledTimes(1);expect(state.info.mock.calls[0][0]).toBe('Nuevo mensaje recibido.');expect(state.play).toHaveBeenCalledTimes(1);
 expect(JSON.stringify(state.info.mock.calls)).not.toContain('Private');act(()=>state.info.mock.calls[0][1].action.onClick());expect(screen.getByText('Authorized detail')).toBeTruthy();
})
it('polling suspends while hidden and focus/visibility bursts coalesce when visible',async()=>{
 vi.useFakeTimers();mount();await act(()=>vi.advanceTimersByTimeAsync(0));
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});await act(()=>vi.advanceTimersByTimeAsync(15000));expect(state.api.getNotifications).toHaveBeenCalledTimes(1);
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});fireEvent(window,new Event('focus'));fireEvent(document,new Event('visibilitychange'));
 await act(()=>vi.advanceTimersByTimeAsync(0));expect(state.api.getNotifications).toHaveBeenCalledTimes(2);
})
it('hiding waits for confirmation and reconciles exact counters without guessing a decrement',async()=>{
 const hold=deferred();state.api.hideNotification.mockReturnValue(hold.promise);mount();await waitFor(()=>expect(state.api.getNotifications).toHaveBeenCalledTimes(1));
 fireEvent.click(screen.getByRole('button',{name:/Notificaciones/}));fireEvent.click(screen.getByRole('button',{name:'Limpiar Subject 1'}));
 expect(screen.getByText('Subject 1')).toBeTruthy();expect(screen.getByRole('button',{name:/Notificaciones, 1/})).toBeTruthy();
 state.api.getNotifications.mockResolvedValue(snapshot([2,3],'r2'));
 await act(async()=>hold.resolve({}));await waitFor(()=>expect(screen.getByRole('button',{name:/Notificaciones, 2/})).toBeTruthy());
 expect(screen.queryByText('Subject 1')).toBeNull();expect(screen.getByText('Subject 2')).toBeTruthy();
})
it('clear is one bulk mutation and a new concurrent notification survives the final snapshot',async()=>{
 const hold=deferred();state.api.clearNotifications.mockReturnValue(hold.promise);mount();await waitFor(()=>expect(state.api.getNotifications).toHaveBeenCalledTimes(1));
 fireEvent.click(screen.getByRole('button',{name:/Notificaciones/}));fireEvent.click(screen.getByText('Limpiar'));fireEvent.click(screen.getByText(/Limpiando|Limpiar/));
 expect(state.api.clearNotifications).toHaveBeenCalledTimes(1);state.api.getNotifications.mockResolvedValue(snapshot([99],'r2'));
 await act(async()=>hold.resolve({hiddenCount:1}));await screen.findByText('Subject 99');expect(screen.getByRole('button',{name:/Notificaciones, 1/})).toBeTruthy();
})
it('a failed action keeps the visible notice until authoritative reconciliation and reports the error',async()=>{
 state.api.hideNotification.mockRejectedValue({status:500});mount();await waitFor(()=>expect(state.api.getNotifications).toHaveBeenCalledTimes(1));
 fireEvent.click(screen.getByRole('button',{name:/Notificaciones/}));fireEvent.click(screen.getByRole('button',{name:'Limpiar Subject 1'}));
 await waitFor(()=>expect(state.error).toHaveBeenCalledTimes(1));expect(screen.getByText('Subject 1')).toBeTruthy();expect(state.api.hideNotification).toHaveBeenCalledTimes(1);
})
it('account changes discard old reads and pending writes without toasts, count leaks or stale lists',async()=>{
 const hold=deferred();state.api.hideNotification.mockReturnValue(hold.promise);const view=mount();await waitFor(()=>expect(state.api.getNotifications).toHaveBeenCalledTimes(1));
 fireEvent.click(screen.getByRole('button',{name:/Notificaciones/}));fireEvent.click(screen.getByRole('button',{name:'Limpiar Subject 1'}));
 const old=state.api;state.api={...old,scopeId:++scope,getNotifications:vi.fn().mockResolvedValue(snapshot([8],'new-account'))};
 view.rerender(<MemoryRouter><NotificationBell/></MemoryRouter>);await waitFor(()=>expect(state.api.getNotifications).toHaveBeenCalledTimes(1));
 await act(async()=>hold.resolve({}));expect(screen.queryByText('Subject 1')).toBeNull();expect(state.info).not.toHaveBeenCalled();expect(state.error).not.toHaveBeenCalled();
 expect(old.getNotifications.mock.calls[0][1].signal.aborted).toBe(true);
})
it('authorization errors clear private state and stop polling until a new API/session',async()=>{
 vi.useFakeTimers();state.api.getNotifications.mockRejectedValue({status:401});mount();await act(()=>vi.advanceTimersByTimeAsync(15000));
 expect(state.api.getNotifications).toHaveBeenCalledTimes(1);fireEvent.click(screen.getByRole('button',{name:/Notificaciones/}));expect(screen.getByRole('alert')).toBeTruthy();
})
it('Escape closes the popover and returns keyboard focus without reopening it after a pending clear',async()=>{
 const hold=deferred();state.api.clearNotifications.mockReturnValue(hold.promise);mount();await waitFor(()=>expect(state.api.getNotifications).toHaveBeenCalledTimes(1));
 const button=screen.getByRole('button',{name:/Notificaciones/});fireEvent.click(button);fireEvent.click(screen.getByText('Limpiar'));
 fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('dialog')).toBeNull();expect(document.activeElement).toBe(button);
 state.api.getNotifications.mockResolvedValue(snapshot([],'empty'));await act(async()=>hold.resolve({hiddenCount:1}));expect(screen.queryByRole('dialog')).toBeNull();
})
