import { useEffect, useRef, useState } from 'react';

export interface LiveToken {
  token: string;
  url: string;
  room: string;
  role?: string;
}

interface ChatMessage {
  from: string;
  text: string;
  at: string;
}

/**
 * LiveKit room view. The access token is always minted by the server after
 * checking the caller's role, grade and the session participant limit.
 */
export function LiveRoom({
  title,
  token,
  role,
  onClose,
}: {
  title: string;
  token: LiveToken;
  role: 'teacher' | 'student';
  onClose: () => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const roomRef = useRef<any>(null);
  const [status, setStatus] = useState('جارٍ الاتصال بغرفة البث…');
  const [connected, setConnected] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [camera, setCamera] = useState(role === 'teacher');
  const [microphone, setMicrophone] = useState(role === 'teacher');
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;

    (async () => {
      const LK: any = await import('livekit-client');
      const room = new LK.Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(LK.RoomEvent.TrackSubscribed, (track: any) => {
        if (!stageRef.current) return;
        const element = track.attach();
        element.setAttribute('data-track', track.kind);
        if (track.kind === 'video') element.className = 'w-full rounded-xl bg-black';
        stageRef.current.appendChild(element);
      });
      room.on(LK.RoomEvent.TrackUnsubscribed, (track: any) => {
        track.detach().forEach((element: HTMLElement) => element.remove());
      });
      room.on(LK.RoomEvent.DataReceived, (payload: Uint8Array, participant: any) => {
        try {
          const data = JSON.parse(new TextDecoder().decode(payload));
          if (data?.type === 'chat' && typeof data.text === 'string') {
            setChat((prev) => [
              ...prev,
              { from: participant?.name || participant?.identity || 'مشارك', text: data.text, at: new Date().toISOString() },
            ]);
          }
        } catch {
          /* ignore malformed payloads */
        }
      });
      room.on(LK.RoomEvent.Reconnecting, () => setStatus('انقطع الاتصال… جارٍ إعادة المحاولة'));
      room.on(LK.RoomEvent.Reconnected, () => {
        setStatus('متصل');
        setConnected(true);
      });
      room.on(LK.RoomEvent.Disconnected, () => {
        setConnected(false);
        setStatus('انتهى الاتصال بالغرفة');
      });

      try {
        await room.connect(token.url, token.token);
        if (disposed) return;
        setConnected(true);
        setStatus('متصل');
        if (role === 'teacher') {
          await room.localParticipant.setCameraEnabled(true);
          await room.localParticipant.setMicrophoneEnabled(true);
          setCamera(true);
          setMicrophone(true);
        }
      } catch (err: any) {
        setStatus('تعذّر الاتصال بالغرفة');
        setError(err?.message ? String(err.message) : 'تحقق من إعدادات LiveKit والاتصال بالإنترنت');
      }
    })();

    return () => {
      disposed = true;
      try {
        roomRef.current?.disconnect();
      } catch {
        /* already disconnected */
      }
      roomRef.current = null;
    };
  }, [token.url, token.token, role]);

  const toggleCamera = async () => {
    const next = !camera;
    await roomRef.current?.localParticipant.setCameraEnabled(next);
    setCamera(next);
  };

  const toggleMicrophone = async () => {
    const next = !microphone;
    await roomRef.current?.localParticipant.setMicrophoneEnabled(next);
    setMicrophone(next);
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !roomRef.current) return;
    const payload = new TextEncoder().encode(JSON.stringify({ type: 'chat', text }));
    await roomRef.current.localParticipant.publishData(payload, { reliable: true });
    setChat((prev) => [...prev, { from: 'أنت', text, at: new Date().toISOString() }]);
    setDraft('');
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-base font-bold sm:text-lg">{title}</h2>
          <p className="text-xs text-white/60">
            {status} · {token.room}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {role === 'teacher' && (
            <>
              <button type="button" onClick={toggleCamera} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20">
                {camera ? 'إيقاف الكاميرا' : 'تشغيل الكاميرا'}
              </button>
              <button type="button" onClick={toggleMicrophone} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20">
                {microphone ? 'كتم الميكروفون' : 'تشغيل الميكروفون'}
              </button>
            </>
          )}
          <button type="button" onClick={onClose} className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold hover:bg-rose-700">
            خروج من المحاضرة
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row">
        <div className="min-h-0 flex-1 rounded-2xl border border-white/10 bg-black/40 p-2">
          <div ref={stageRef} className="grid h-full grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2" />
          {!connected && (
            <div className="mt-3 space-y-1 px-2 text-xs text-white/60">
              <p>{error || 'جارٍ تجهيز الصوت والصورة…'}</p>
              <p>يلزم اتصال بالإنترنت للبث والدردشة. عند الانقطاع تُعاد المحاولة تلقائيًا.</p>
            </div>
          )}
        </div>

        <aside className="flex h-64 shrink-0 flex-col rounded-2xl border border-white/10 bg-white/5 lg:h-auto lg:w-80">
          <p className="border-b border-white/10 px-3 py-2 text-xs font-semibold text-white/70">الدردشة والأسئلة</p>
          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2 text-xs">
            {chat.length === 0 && <p className="text-white/40">لا رسائل بعد.</p>}
            {chat.map((item, index) => (
              <div key={index} className="rounded-lg bg-white/10 px-2 py-1.5">
                <p className="font-semibold text-brand-200">{item.from}</p>
                <p className="text-white/90">{item.text}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 border-t border-white/10 p-2">
            <input
              className="min-w-0 flex-1 rounded-lg bg-white/10 px-2 py-1.5 text-xs outline-none placeholder:text-white/40"
              placeholder="اكتب سؤالك…"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') send();
              }}
            />
            <button type="button" onClick={send} className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold">
              إرسال
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
