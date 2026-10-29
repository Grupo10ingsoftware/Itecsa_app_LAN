import {StrictMode} from 'react'
import {afterEach,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter,Route,Routes,useNavigate} from 'react-router-dom'
import List from '../pages/OrderHistoryPage'
import Detail from '../pages/OrderHistoryDetailPage'
import {createOrderHistoryApi} from '../api/orderHistoryApi'
import {subscribeHistoryRead,appendHistoryEvents,historyDateError} from './historyReads'
import {formatDate,formatDateTime,formatDuration} from './orderHistoryFormatters'
import * as beforeFormat from './fixtures/formatters.before'
const session=vi.hoisted(()=>({api:null}))
vi.mock('../hooks/useOrderHistoryApi',()=>({useOrderHistoryApi:()=>session.api}))
vi.mock('./orderHistoryFormatters',async original=>{const actual=await original();return {...actual,formatDateTime:vi.fn(actual.formatDateTime),formatDuration:vi.fn(actual.formatDuration)}})
afterEach(()=>{cleanup();vi.clearAllMocks()})
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
const event=(id=1,title=`Evento ${id}`)=>({id,title,type:'stage',typeLabel:'Etapa general',occurredAt:'2024-09-08T04:00:00Z',responsible:'Ana ñ',description:'Corrección conservada',durationSeconds:1})
const info=(cursor=null)=>({limit:50,nextCursor:cursor,hasMore:!!cursor})
const list=(name='SYN-1',cursor=null)=>({items:[{id:1,salesNoteNumber:name,clientName:'Cliente ñ',status:'Cancelado',createdAt:'2024-09-01'}],pageInfo:info(cursor)})
const detail=(name='SYN-1',cursor=null)=>({id:1,salesNoteNumber:name,client:{name:'Cliente ñ'},seller:{name:'Ana'},status:'Cancelado',paymentStatus:'Pendiente',createdAt:'2024-09-01',estimatedCompletionAt:null,items:[],labels:[],events:[event()],pageInfo:info(cursor)})
function mountList() {
 const view=render(<StrictMode><MemoryRouter><List /></MemoryRouter></StrictMode>)
 const toggle=screen.getByRole('button',{name:'Expandir filtros del historial'})
 expect(toggle.getAttribute('aria-expanded')).toBe('false')
 fireEvent.click(toggle)
 return view
}
it.each([
 ['Todos', ''], ['Confirmación de Pago', 'Confirmación de Pago'],
 ['Listo para producción', 'Listo para Producción'], ['En producción', 'En producción'],
 ['Listo para despacho', 'Listo para Entrega'], ['Finalizado', 'Terminado'], ['Cancelado', 'Cancelado'],
])('applies combined search, creation dates and the existing %s state, then clears all criteria', async (label, status) => {
 session.api={listOrders:vi.fn().mockResolvedValue(list())};mountList();await screen.findByText('SYN-1')
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'  NV-001  '}})
 fireEvent.change(screen.getByLabelText('Desde'),{target:{value:'2026-01-01'}})
 fireEvent.change(screen.getByLabelText('Hasta'),{target:{value:'2026-10-28'}})
 fireEvent.click(screen.getByRole('button',{name:label,exact:true}))
 fireEvent.click(screen.getByRole('button',{name:'Contraer filtros del historial'}))
 expect(session.api.listOrders).toHaveBeenCalledTimes(1)
 fireEvent.click(screen.getByRole('button',{name:'Expandir filtros del historial'}))
 expect(screen.getByRole('searchbox').value).toBe('  NV-001  ')
 fireEvent.click(screen.getByRole('button',{name:'Buscar pedidos'}))
 await waitFor(()=>expect(session.api.listOrders).toHaveBeenCalledTimes(2))
 expect(session.api.listOrders.mock.calls[1][0]).toMatchObject({status,search:'NV-001',from:'2026-01-01',to:'2026-10-28',cursor:null,limit:50})
 await screen.findByText('SYN-1')
 fireEvent.click(screen.getByRole('button',{name:'Limpiar filtros'}))
 await waitFor(()=>expect(session.api.listOrders).toHaveBeenCalledTimes(3))
 expect(session.api.listOrders.mock.calls[2][0]).toMatchObject({status:'',search:'',from:'',to:'',cursor:null})
 expect(screen.getByRole('searchbox').value).toBe('')
})
function Navigation(){const navigate=useNavigate();return <><button onClick={()=>navigate('/h/1')}>Ir uno</button><button onClick={()=>navigate('/h/2')}>Ir dos</button></>}
const mountDetail=()=>render(<StrictMode><MemoryRouter initialEntries={['/h/1']}><Navigation/><Routes><Route path="/h/:orderId" element={<Detail/>}/></Routes></MemoryRouter></StrictMode>)

it('forwards AbortSignal outside all three URLs and preserves encoded filters/cursors',async()=>{
 const get=vi.fn().mockResolvedValue({}),api=createOrderHistoryApi({get}),signal=new AbortController().signal
 await api.listOrders({search:'ñ %_',cursor:'signed.cursor',signal,limit:50});await api.getOrderHistory(1,{type:'all',signal});await api.listOrderEvents(1,{cursor:'x',signal})
 expect(get.mock.calls).toEqual([['/history/orders?search=%C3%B1+%25_&cursor=signed.cursor&limit=50',{signal}],['/history/orders/1?type=all',{signal}],['/history/orders/1/events?cursor=x',{signal}]])
})

it('shares pending reads only within one API, cancels the last listener and never caches completed pages',async()=>{
 const request=deferred(),api={listOrders:vi.fn(()=>request.promise)},a=vi.fn(),b=vi.fn(),params={limit:50}
 const stop=subscribeHistoryRead({api,method:'listOrders',params,onSuccess:a,onError:vi.fn()})
 const stopB=subscribeHistoryRead({api,method:'listOrders',params,onSuccess:b,onError:vi.fn()});await Promise.resolve();expect(api.listOrders).toHaveBeenCalledTimes(1)
 stop();await Promise.resolve();expect(api.listOrders.mock.calls[0][0].signal.aborted).toBe(false)
 request.resolve(list());await Promise.resolve();expect(a).not.toHaveBeenCalled();expect(b).toHaveBeenCalledTimes(1);stopB();await Promise.resolve()
 const stopC=subscribeHistoryRead({api,method:'listOrders',params,onSuccess:vi.fn(),onError:vi.fn()});await Promise.resolve();expect(api.listOrders).toHaveBeenCalledTimes(2);stopC();await Promise.resolve();expect(api.listOrders.mock.calls[1][0].signal.aborted).toBe(true)
})

it('list StrictMode makes one initial read, keeps explicit search and skips unchanged Apply',async()=>{
 session.api={listOrders:vi.fn().mockResolvedValue(list())};mountList();await screen.findByText('SYN-1');expect(session.api.listOrders).toHaveBeenCalledTimes(1)
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'  ñ parcial  '}});expect(session.api.listOrders).toHaveBeenCalledTimes(1)
 fireEvent.click(screen.getByRole('button',{name:'Buscar pedidos'}));await waitFor(()=>expect(session.api.listOrders).toHaveBeenCalledTimes(2));expect(session.api.listOrders.mock.calls[1][0].search).toBe('ñ parcial');expect(session.api.listOrders.mock.calls[1][0].cursor).toBeNull()
 await screen.findByText('SYN-1');fireEvent.click(screen.getByRole('button',{name:'Aplicar filtros'}));expect(session.api.listOrders).toHaveBeenCalledTimes(2)
})

it('list preserves cursor stack, guards double pagination and resets cursor on filters',async()=>{
 const second=deferred();session.api={listOrders:vi.fn().mockResolvedValueOnce(list('Primera','c2')).mockReturnValueOnce(second.promise).mockResolvedValue(list('Fresca','c2'))};mountList();await screen.findByText('Primera')
 const next=screen.getByRole('button',{name:'Siguiente'});fireEvent.click(next);fireEvent.click(next);await waitFor(()=>expect(session.api.listOrders).toHaveBeenCalledTimes(2));expect(session.api.listOrders.mock.calls[1][0].cursor).toBe('c2');expect(screen.queryByText('Primera')).toBeNull()
 await act(async()=>second.resolve(list('Segunda','c3')));fireEvent.click(screen.getByRole('button',{name:'Anterior'}));await screen.findByText('Fresca');expect(session.api.listOrders.mock.calls[2][0].cursor).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Cancelado'}));fireEvent.click(screen.getByRole('button',{name:'Aplicar filtros'}));await waitFor(()=>expect(session.api.listOrders).toHaveBeenCalledTimes(4));expect(session.api.listOrders.mock.calls[3][0]).toMatchObject({status:'Cancelado',cursor:null,limit:50})
})

it('rapid list filters abort abandoned reads, reject late results and keep the latest selection',async()=>{
 const old=deferred(),fresh=deferred();session.api={listOrders:vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)};mountList();await waitFor(()=>expect(session.api.listOrders).toHaveBeenCalledTimes(1))
 fireEvent.click(screen.getByRole('button',{name:'Cancelado'}));fireEvent.click(screen.getByRole('button',{name:'Aplicar filtros'}));await waitFor(()=>expect(session.api.listOrders).toHaveBeenCalledTimes(2));expect(session.api.listOrders.mock.calls[0][0].signal.aborted).toBe(true)
 await act(async()=>fresh.resolve(list('Nuevo')));await act(async()=>old.resolve(list('Obsoleto')));expect(screen.getByText('Nuevo')).toBeTruthy();expect(screen.queryByText('Obsoleto')).toBeNull()
})

it('list error retry stays on the same filters and does not present stale rows as current',async()=>{
 session.api={listOrders:vi.fn().mockResolvedValueOnce(list('Anterior')).mockRejectedValueOnce({payload:{message:'Error de red'}}).mockResolvedValue(list('Reintentada'))};mountList();await screen.findByText('Anterior');fireEvent.click(screen.getByRole('button',{name:'Cancelado'}));fireEvent.click(screen.getByRole('button',{name:'Aplicar filtros'}));await screen.findByRole('alert');expect(screen.queryByText('Anterior')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Reintentar'}));await screen.findByText('Reintentada');expect(session.api.listOrders).toHaveBeenCalledTimes(3);expect(session.api.listOrders.mock.calls[2][0].status).toBe('Cancelado')
})

it('list API change removes previous-session data immediately and refetches',async()=>{
 session.api={listOrders:vi.fn().mockResolvedValue(list('Privado'))};const view=mountList();await screen.findByText('Privado')
 const fresh=deferred();session.api={listOrders:vi.fn(()=>fresh.promise)};view.rerender(<MemoryRouter><List/></MemoryRouter>);expect(screen.queryByText('Privado')).toBeNull();await act(async()=>fresh.resolve(list('Otra sesión')));expect(screen.getByText('Otra sesión')).toBeTruthy()
})

it('validates reversed creation dates locally, accepts partial and open ranges without a new cap',async()=>{
 session.api={listOrders:vi.fn().mockResolvedValue(list())};mountList();await screen.findByText('SYN-1')
 fireEvent.change(screen.getByLabelText('Desde'),{target:{value:'2024-09-10'}});fireEvent.click(screen.getByRole('button',{name:'Aplicar filtros'}));await waitFor(()=>expect(session.api.listOrders).toHaveBeenCalledTimes(2))
 fireEvent.change(screen.getByLabelText('Hasta'),{target:{value:'2024-09-01'}});expect(screen.getByRole('alert').textContent).toContain('posterior');expect(session.api.listOrders).toHaveBeenCalledTimes(2)
 fireEvent.change(screen.getByLabelText('Hasta'),{target:{value:'2025-12-31'}});fireEvent.click(screen.getByRole('button',{name:'Aplicar filtros'}));await waitFor(()=>expect(session.api.listOrders).toHaveBeenCalledTimes(3))
 expect(historyDateError({from:'2024-02-30',to:''})).toBeTruthy();expect(historyDateError({from:'2024-02-29',to:''})).toBe('');expect(historyDateError({from:'',to:'2024-09-01'})).toBe('')
})

it('detail StrictMode gets one header, event filters only replace the timeline',async()=>{
 const request=deferred();session.api={getOrderHistory:vi.fn().mockResolvedValue(detail()),listOrderEvents:vi.fn(()=>request.promise)};mountDetail();await screen.findByText('Evento 1');expect(session.api.getOrderHistory).toHaveBeenCalledTimes(1)
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'payment'}});expect(screen.getByRole('heading',{name:'SYN-1'})).toBeTruthy();expect(screen.queryByText('Evento 1')).toBeNull();await waitFor(()=>expect(session.api.listOrderEvents).toHaveBeenCalledTimes(1));expect(session.api.getOrderHistory).toHaveBeenCalledTimes(1)
 await act(async()=>request.resolve({events:[event(2,'Pago visible')],pageInfo:info()}));expect(screen.getByText('Pago visible')).toBeTruthy()
})

it('load more permits retry of the same failed cursor, keeps tied timestamps and avoids rerendering old events',async()=>{
 session.api={getOrderHistory:vi.fn().mockResolvedValue(detail('SYN-1','c2')),listOrderEvents:vi.fn().mockRejectedValueOnce(Error()).mockResolvedValue({events:[event(1),event(2)],pageInfo:info()})};mountDetail();await screen.findByText('Evento 1');const formats=formatDateTime.mock.calls.length
 const more=screen.getByRole('button',{name:'Cargar más registros'});fireEvent.click(more);fireEvent.click(more);await screen.findByRole('alert');expect(session.api.listOrderEvents).toHaveBeenCalledTimes(1);expect(formatDateTime).toHaveBeenCalledTimes(formats)
 fireEvent.click(screen.getByRole('button',{name:'Reintentar'}));await screen.findByText('Evento 2');expect(session.api.listOrderEvents.mock.calls.map(call=>call[1].cursor)).toEqual(['c2','c2']);expect(screen.getAllByText('Evento 1')).toHaveLength(1);expect(session.api.getOrderHistory).toHaveBeenCalledTimes(1);expect(formatDateTime.mock.calls.length).toBe(formats+2) // StrictMode renders each new card twice.
 expect(screen.queryByRole('button',{name:'Cargar más registros'})).toBeNull()
})

it('changing type cancels a pending continuation and ignores its late response',async()=>{
 const more=deferred(),filter=deferred();session.api={getOrderHistory:vi.fn().mockResolvedValue(detail('SYN-1','c2')),listOrderEvents:vi.fn().mockReturnValueOnce(more.promise).mockReturnValueOnce(filter.promise)};mountDetail();await screen.findByText('Evento 1');fireEvent.click(screen.getByRole('button',{name:'Cargar más registros'}));await waitFor(()=>expect(session.api.listOrderEvents).toHaveBeenCalledTimes(1))
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'general'}});await waitFor(()=>expect(session.api.listOrderEvents).toHaveBeenCalledTimes(2));expect(session.api.listOrderEvents.mock.calls[0][1].signal.aborted).toBe(true);expect(session.api.listOrderEvents.mock.calls[1][1].cursor).toBeNull()
 await act(async()=>filter.resolve({events:[event(7,'Filtro nuevo')],pageInfo:info()}));await act(async()=>more.resolve({events:[event(9,'Página obsoleta')],pageInfo:info()}));expect(screen.getByText('Filtro nuevo')).toBeTruthy();expect(screen.queryByText('Página obsoleta')).toBeNull();expect(session.api.getOrderHistory).toHaveBeenCalledTimes(1)
})

it('the load-more button itself retries its failed cursor instead of becoming stuck',async()=>{
 session.api={getOrderHistory:vi.fn().mockResolvedValue(detail('SYN-1','c2')),listOrderEvents:vi.fn().mockRejectedValueOnce(Error()).mockResolvedValue({events:[event(2)],pageInfo:info()})};mountDetail();await screen.findByText('Evento 1')
 fireEvent.click(screen.getByRole('button',{name:'Cargar más registros'}));await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Cargar más registros'}));await screen.findByText('Evento 2');expect(session.api.listOrderEvents.mock.calls.map(call=>call[1].cursor)).toEqual(['c2','c2']);expect(session.api.getOrderHistory).toHaveBeenCalledTimes(1);expect(screen.queryByRole('alert')).toBeNull()
})

it('detail navigation isolates order IDs and never mixes a late header with another order',async()=>{
 const old=deferred();session.api={getOrderHistory:vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(detail('Pedido dos')),listOrderEvents:vi.fn()};mountDetail();await waitFor(()=>expect(session.api.getOrderHistory).toHaveBeenCalledTimes(1));fireEvent.click(screen.getByRole('button',{name:'Ir dos'}));await screen.findByRole('heading',{name:'Pedido dos'});await act(async()=>old.resolve(detail('Pedido uno tardío')));expect(screen.queryByText('Pedido uno tardío')).toBeNull();expect(session.api.getOrderHistory.mock.calls[0][1].signal.aborted).toBe(true);expect(session.api.getOrderHistory.mock.calls[1][0]).toBe('2');expect(session.api.listOrderEvents).not.toHaveBeenCalled()
})

it('detail session/permission change clears header and events and requests a full new authorized detail',async()=>{
 session.api={getOrderHistory:vi.fn().mockResolvedValue({...detail('Financiero anterior'),events:[event(1,'Pago privado')]}),listOrderEvents:vi.fn()};const view=mountDetail();await screen.findByText('Pago privado');const fresh=deferred();session.api={getOrderHistory:vi.fn(()=>fresh.promise),listOrderEvents:vi.fn()};view.rerender(<MemoryRouter initialEntries={['/h/1']}><Routes><Route path="/h/:orderId" element={<Detail/>}/></Routes></MemoryRouter>);expect(screen.queryByText('Pago privado')).toBeNull();expect(screen.queryByText('Financiero anterior')).toBeNull();await act(async()=>fresh.resolve(detail('Otra autorización')));expect(screen.getByRole('heading',{name:'Otra autorización'})).toBeTruthy();expect(session.api.getOrderHistory).toHaveBeenCalledTimes(1);expect(session.api.listOrderEvents).not.toHaveBeenCalled()
})

it('initial detail failures allow an explicit retry without leaving the order',async()=>{
 session.api={getOrderHistory:vi.fn().mockRejectedValueOnce(Error()).mockResolvedValue(detail()),listOrderEvents:vi.fn()};mountDetail();await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Reintentar'}));await screen.findByText('Evento 1');expect(session.api.getOrderHistory).toHaveBeenCalledTimes(2)
})

it('formatters preserve UTC dates, local datetimes, DST boundaries and duration/null behavior',()=>{
 for(const value of [null,undefined,'bad','2024-02-29','2024-09-08T03:59:59Z','2024-09-08T04:00:00Z','2025-01-01T00:00:00Z']){expect(formatDate(value)).toBe(beforeFormat.formatDate(value));expect(formatDateTime(value)).toBe(beforeFormat.formatDateTime(value))}
 for(const value of [null,undefined,'bad',0,1,59,60,3600,-1,0.5])expect(formatDuration(value)).toBe(beforeFormat.formatDuration(value))
 const a=[event(3),event(2)],result=appendHistoryEvents(a,[event(2),event(1),event(1)]);expect(result.map(e=>e.id)).toEqual([3,2,1]);expect(result[0]).toBe(a[0]);expect(a).toHaveLength(2)
})
