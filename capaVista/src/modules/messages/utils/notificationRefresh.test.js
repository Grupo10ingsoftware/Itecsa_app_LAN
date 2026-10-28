import { expect, it, vi } from 'vitest'
import { createNotificationRefresh } from './notificationRefresh'
import { notificationPreview, messagePreview } from './messageFormatters'
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
it('coalesces focus/visibility/open bursts, reuses in-flight reads and keeps one dirty followup',async()=>{
 let time=0;const first=deferred(), load=vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({});
 const scheduler=createNotificationRefresh({load,onData:vi.fn(),onError:vi.fn(),now:()=>time});
 const work=scheduler.request();scheduler.request();scheduler.request({invalidate:true});scheduler.request({invalidate:true});
 await Promise.resolve();expect(load).toHaveBeenCalledTimes(1);first.resolve({});await work;
 expect(load).toHaveBeenCalledTimes(2);await scheduler.request();expect(load).toHaveBeenCalledTimes(2);
 time=5000;await scheduler.request();expect(load).toHaveBeenCalledTimes(3);scheduler.dispose();
})
it('defers invalidations during an action, aborts old data and reconciles once after confirmation',async()=>{
 const first=deferred(),data=vi.fn();const load=vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({latest:2});
 const scheduler=createNotificationRefresh({load,onData:data,onError:vi.fn()});
 const work=scheduler.request();await Promise.resolve();scheduler.beginAction();expect(load.mock.calls[0][0].signal.aborted).toBe(true);
 await scheduler.request({invalidate:true});const done=scheduler.endAction();first.resolve({old:1});await work;await done;
 expect(data).toHaveBeenCalledExactlyOnceWith({latest:2});expect(load).toHaveBeenCalledTimes(2);
})
it('suspends hidden reads, preserves dirty state until visible, and disposes without late delivery',async()=>{
 let visible=false;const data=vi.fn(),hold=deferred(),load=vi.fn().mockReturnValue(hold.promise);
 const scheduler=createNotificationRefresh({load,onData:data,onError:vi.fn(),visible:()=>visible});
 await scheduler.request({invalidate:true});expect(load).not.toHaveBeenCalled();visible=true;
 const work=scheduler.request();await Promise.resolve();scheduler.dispose();hold.resolve({});await work;expect(data).not.toHaveBeenCalled();
 await scheduler.request();expect(load).toHaveBeenCalledTimes(1);
})
it('network errors permit the next normal polling request and never retry recursively',async()=>{
 let time=0;const error=vi.fn(),load=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue({});
 const scheduler=createNotificationRefresh({load,onData:vi.fn(),onError:error,now:()=>time});
 await scheduler.request();expect(error).toHaveBeenCalledTimes(1);expect(load).toHaveBeenCalledTimes(1);
 time=5000;await scheduler.request();expect(load).toHaveBeenCalledTimes(2);
})
it('compact previews match existing rendering for whitespace, long Unicode and exact boundaries',()=>{
 for(const text of ['','short','x'.repeat(82),'x'.repeat(83),'  a\n\t b  ', '😀 mensaje\u00a0'.repeat(100), 'x'.repeat(81)+' '+ 'long']){
 const normalized=text.replace(/\s+/g,' ').trim();
 expect(notificationPreview({preview:normalized.slice(0,82).trim(),truncated:normalized.length>82})).toBe(messagePreview(text,82));
 }
})
