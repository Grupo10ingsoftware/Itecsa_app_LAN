vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => true }) }))
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { MemoryRouter,Route,Routes } from 'react-router-dom'
import MessageDetailPage from './MessageDetailPage'
import MessageInboxPage from './MessageInboxPage'
const state=vi.hoisted(()=>({api:null}))
vi.mock('../hooks/useMessagesApi',()=>({useMessagesApi:()=>state.api}))
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
const message=(id,leido=true)=>({id_mensaje:id,Asunto:'Message '+id,contenido:'Private '+id,leido,oculto:false,fecha_publicacion:'2026-01-01'})
let scope=0
beforeEach(()=>{state.api={scopeId:++scope,openMessage:vi.fn().mockResolvedValue({message:message(1),markedAsRead:true}),getInbox:vi.fn().mockResolvedValue({messages:[message(1,false)],total:24,totalPages:2})}})
afterEach(cleanup)
const detail=()=>render(<MemoryRouter initialEntries={['/mensajes/1']}><Routes><Route path="/mensajes/:messageId" element={<MessageDetailPage/>}/></Routes></MemoryRouter>)
it('direct detail performs one explicit open, waits for confirmation and emits one invalidation',async()=>{
 const hold=deferred();state.api.openMessage.mockReturnValue(hold.promise);const changed=vi.fn();window.addEventListener('messages:changed',changed);
 const view=detail();await waitFor(()=>expect(state.api.openMessage).toHaveBeenCalledExactlyOnceWith('1'));
 expect(screen.queryByText('Private 1')).toBeNull();expect(changed).not.toHaveBeenCalled();
 await act(async()=>hold.resolve({message:message(1),markedAsRead:true}));expect(screen.getByText('Private 1')).toBeTruthy();expect(changed).toHaveBeenCalledTimes(1);
 view.unmount();window.removeEventListener('messages:changed',changed);
})
it('failed open remains an error until explicit retry and never fabricates a read badge',async()=>{
 state.api.openMessage.mockRejectedValueOnce({status:503}).mockResolvedValue({message:message(1),markedAsRead:false});detail();
 await screen.findByRole('alert');expect(screen.queryByText('Leído')).toBeNull();expect(state.api.openMessage).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByText('Reintentar'));await screen.findByText('Private 1');expect(state.api.openMessage).toHaveBeenCalledTimes(2);
})
it('an account change cannot display or announce the old account open result',async()=>{
 const old=deferred();state.api.openMessage.mockReturnValue(old.promise);const view=detail();await waitFor(()=>expect(state.api.openMessage).toHaveBeenCalledTimes(1));
 state.api={...state.api,scopeId:++scope,openMessage:vi.fn().mockResolvedValue({message:message(1,false),markedAsRead:false})};
 view.rerender(<MemoryRouter initialEntries={['/mensajes/1']}><Routes><Route path="/mensajes/:messageId" element={<MessageDetailPage/>}/></Routes></MemoryRouter>);
 await screen.findByText('Sin leer');await act(async()=>old.resolve({message:{...message(1),contenido:'OLD PRIVATE'},markedAsRead:true}));expect(screen.queryByText('OLD PRIVATE')).toBeNull();
})
it('filters from page two issue exactly one new request, reset page and abort the previous read',async()=>{
 render(<MemoryRouter><MessageInboxPage/></MemoryRouter>);fireEvent.click(await screen.findByText('Siguiente'));
 await waitFor(()=>expect(state.api.getInbox).toHaveBeenCalledTimes(2));
 fireEvent.click(screen.getByRole('button',{name:'No leídos'}));await waitFor(()=>expect(state.api.getInbox).toHaveBeenCalledTimes(3));
 expect(state.api.getInbox.mock.calls[2][0]).toMatchObject({status:'unread',page:1,perPage:12});expect(state.api.getInbox.mock.calls[1][1].signal.aborted).toBe(true);
})
