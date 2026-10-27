import { act,cleanup,fireEvent,renderHook } from '@testing-library/react'
import { afterEach,expect,it,vi } from 'vitest'
import { useMessageSound } from './useMessageSound'
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('audio unlocks only after interaction, plays one cue and disconnects resources on end/unmount',()=>{
 const oscillator={connect:vi.fn(),disconnect:vi.fn(),frequency:{setValueAtTime:vi.fn()},start:vi.fn(),stop:vi.fn()};
 const gain={connect:vi.fn(),disconnect:vi.fn(),gain:{setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()}};
 const context={state:'running',currentTime:0,destination:{},resume:vi.fn().mockResolvedValue(),close:vi.fn().mockResolvedValue(),createOscillator:vi.fn(()=>oscillator),createGain:vi.fn(()=>gain)};
 vi.stubGlobal('AudioContext',class{constructor(){return context}});
 const view=renderHook(()=>useMessageSound());act(()=>view.result.current());expect(context.createOscillator).not.toHaveBeenCalled();
 fireEvent.pointerDown(document);act(()=>view.result.current());expect(context.resume).toHaveBeenCalledTimes(1);expect(oscillator.start).toHaveBeenCalledTimes(1);
 act(()=>oscillator.onended());expect(oscillator.disconnect).toHaveBeenCalledTimes(1);expect(gain.disconnect).toHaveBeenCalledTimes(1);
 view.unmount();expect(context.close).toHaveBeenCalledTimes(1);fireEvent.keyDown(document);expect(context.resume).toHaveBeenCalledTimes(1);
})
it('unsupported or browser-blocked audio does not prevent visual notifications',()=>{
 vi.stubGlobal('AudioContext',undefined);vi.stubGlobal('webkitAudioContext',undefined);
 const view=renderHook(()=>useMessageSound());fireEvent.keyDown(document);expect(()=>view.result.current()).not.toThrow();
})
