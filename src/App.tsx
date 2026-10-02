import React, { useState, useEffect } from 'react';
import { 
  Send, 
  Database, 
  FolderArchive, 
  Github, 
  CheckCircle2, 
  Terminal, 
  Sparkles, 
  Bot, 
  ArrowRight,
  ShieldCheck,
  Smartphone
} from 'lucide-react';

interface TelegramUser {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export default function App() {
  const [isInTelegram, setIsInTelegram] = useState(false);
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);

  useEffect(() => {
    // Check if running inside Telegram WebApp
    const tg = (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: TelegramUser }; ready?: () => void; expand?: () => void } } })?.Telegram?.WebApp;
    if (tg && tg.initDataUnsafe?.user) {
      setIsInTelegram(true);
      setTelegramUser(tg.initDataUnsafe.user);
      tg.ready?.();
      tg.expand?.();
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Header bar */}
        <div className="bg-slate-850 border-b border-slate-800/80 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Send className="w-5 h-5 -rotate-12 translate-x-0.5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white flex items-center gap-2">
                Telegram Mini App
                <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Tayyor
                </span>
              </h1>
              <p className="text-xs text-slate-400">Supabase & GitHub loyihasini davom ettirish muhiti</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
            <Smartphone className="w-3.5 h-3.5 text-sky-400" />
            <span>{isInTelegram ? 'Telegram WebApp faol' : 'Web Preview'}</span>
          </div>
        </div>

        {/* Content body */}
        <div className="p-6 sm:p-8 space-y-6">
          
          {/* Welcoming prompt box */}
          <div className="bg-sky-950/30 border border-sky-800/40 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
              <div className="space-y-1 text-sm">
                <p className="font-medium text-sky-200">
                  Ha, albatta! Loyihangizni to'liq davom ettira olamiz.
                </p>
                <p className="text-slate-300 leading-relaxed text-xs sm:text-sm">
                  Telegram Mini App kodingizni <strong className="text-white font-semibold">.zip</strong> shaklida chatga tashlasangiz, 
                  men arxivni ochib, barcha fayllarni o'rnataman, Supabase bazangizni ulab beraman va yangi xususiyatlarni qo'shib beraman.
                </p>
              </div>
            </div>
          </div>

          {/* Steps checklist */}
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Qanday qilib yuklash va boshlash mumkin?
            </h2>

            <div className="grid gap-3">
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-start gap-3.5 hover:border-slate-700 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <FolderArchive className="w-4 h-4" />
                </div>
                <div className="space-y-0.5 text-sm">
                  <div className="font-medium text-slate-200 flex items-center gap-2">
                    1. .ZIP arxivni chatga yuboring
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Loyihangiz papkasini arxivlab (masalan: <code className="bg-slate-800 px-1 py-0.5 rounded text-amber-300">app.zip</code>), 
                    chatga tashlang yoki chap tomondagi fayllar paneliga yuklang.
                  </p>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-start gap-3.5 hover:border-slate-700 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <Database className="w-4 h-4" />
                </div>
                <div className="space-y-0.5 text-sm">
                  <div className="font-medium text-slate-200">
                    2. Supabase ma'lumotlarini ulash
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Supabase loyihangizning <code className="bg-slate-800 px-1 py-0.5 rounded text-emerald-300">URL</code> va <code className="bg-slate-800 px-1 py-0.5 rounded text-emerald-300">anon key</code> ini 
                    chatda yoki maxfiy o'zgaruvchilarda ko'rsatsangiz, bazaga to'g'ridan-to'g'ri bog'laymiz.
                  </p>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-start gap-3.5 hover:border-slate-700 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="space-y-0.5 text-sm">
                  <div className="font-medium text-slate-200">
                    3. Telegram WebApp integratsiyasi
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Telegram foydalanuvchi ma'lumotlari, <code className="bg-slate-800 px-1 py-0.5 rounded text-indigo-300">MainButton</code>, 
                    <code className="bg-slate-800 px-1 py-0.5 rounded text-indigo-300">BackButton</code>, haptic feedback va barcha TWA imkoniyatlari qo'llab-quvvatlanadi.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Telegram Status Card if in Telegram or Mock preview */}
          {isInTelegram && telegramUser && (
            <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-xl p-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="text-xs">
                <span className="font-medium text-emerald-300">Telegram orqali kirildi: </span>
                <span className="text-slate-300">
                  {telegramUser.first_name} {telegramUser.last_name || ''} (@{telegramUser.username || 'n/a'})
                </span>
              </div>
            </div>
          )}

          {/* Quick tips */}
          <div className="border-t border-slate-800/80 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              <span>Barcha fayllar va kalitlar xavfsiz saqlanadi</span>
            </div>
            <div className="text-slate-400 italic">
              Zip faylni chatga tashlang, darhol ishga kirishamiz!
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

