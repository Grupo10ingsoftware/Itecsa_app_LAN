import { expect,it,vi } from 'vitest'
import { createMessagesApi } from './messagesApi'
it('keeps default read endpoints, explicitly opts into compact polling and forwards GET cancellation',async()=>{
 const client={get:vi.fn().mockResolvedValue({})};const api=createMessagesApi(client),signal=new AbortController().signal;
 await api.getNotifications(50);expect(client.get).toHaveBeenLastCalledWith('/messages/notifications?limit=50',{signal:undefined});
 await api.getNotifications(50,{compact:true,revision:'opaque',signal});expect(client.get).toHaveBeenLastCalledWith('/messages/notifications?limit=50&view=bell&revision=opaque',{signal});
 await api.getInbox({status:'unread',page:2},{signal});expect(client.get).toHaveBeenLastCalledWith('/messages?status=unread&page=2',{signal});
 await api.getMessage(1,{signal});expect(client.get).toHaveBeenLastCalledWith('/messages/1',{signal});
})
it('keeps mutation payloads isolated and never cancels/retries writes; API scopes differ across sessions',async()=>{
 const client={post:vi.fn().mockResolvedValue({}),patch:vi.fn().mockResolvedValue({})};const a=createMessagesApi(client),b=createMessagesApi(client);
 expect(a.scopeId).not.toBe(b.scopeId);await a.openMessage(1);expect(client.post).toHaveBeenCalledExactlyOnceWith('/messages/1/open',{});
 await a.markAsRead(1);await a.hideNotification(1);await a.clearNotifications();
 expect(client.patch.mock.calls).toEqual([['/messages/1/read',{}],['/messages/notifications/1'],['/messages/notifications']]);
})
