import React, {useState} from "react";

export default function MavisDragon({onSendMessage}) {
  const [open,setOpen]=useState(false);
  const [text,setText]=useState("");

  const send=()=>{
    if(!text.trim()) return;
    onSendMessage?.(text);
    setText("");
  };

  return <>
    {!open && (
      <button
        onClick={()=>setOpen(true)}
        className="fixed bottom-6 right-6 z-[9999] h-16 w-16 rounded-full bg-pink-100 text-4xl shadow-xl hover:scale-110 transition"
        title="Mavis AI"
      >
        🐉
      </button>
    )}

    {open && (
      <div className="fixed bottom-6 right-6 z-[9999] w-[380px] rounded-3xl bg-white shadow-2xl ring-1 ring-pink-100 overflow-hidden">
        <div className="flex justify-between items-center bg-pink-50 px-5 py-4 font-semibold">
          <span>🐉 Mavis AI помощник</span>
          <button onClick={()=>setOpen(false)}>✕</button>
        </div>

        <div className="p-5 text-sm text-slate-600 min-h-[180px]">
          Напиши задачи как удобно:
          <br/><br/>
          «Таня проверяет CRM до пятницы»
          <br/>
          «Создать отчет продаж за август»
          <br/><br/>
          Я помогу распределить по проектам.
        </div>

        <div className="flex gap-2 p-4 border-t">
          <input
            value={text}
            onChange={e=>setText(e.target.value)}
            onKeyDown={e=>e.key==="Enter" && send()}
            placeholder="Напишите задачи..."
            className="flex-1 rounded-2xl border px-4 py-2"
          />
          <button
            onClick={send}
            className="rounded-2xl bg-violet-600 px-4 text-white"
          >
            ➤
          </button>
        </div>
      </div>
    )}
  </>;
}
