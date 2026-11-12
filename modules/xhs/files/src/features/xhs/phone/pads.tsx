// 茶具垫图：封面模板里的“实拍”位置先用插画顶上（对应素材库 a_pad1—5 的描述），不依赖生图。归属：小红书内容模块。
// 插画的颜色写在这里（是画，不是界面色）。每个实例用 useId 生成独立的渐变编号，同一页画很多张也不串。
import { useId } from 'react'

export const PAD_NAMES: Record<string, string> = {
  a_pad1: '工位俯拍：盖碗 + 电脑一角', a_pad2: '玻璃公道杯逆光', a_pad3: '保温杯 + 寿眉饼', a_pad4: '会议室一杯岩茶', a_pad5: '暖光小陶炉和茶壶',
}

type P = { k: string }

function Desk({ k }: P) {
  return (
    <>
      <defs>
        <linearGradient id={`${k}w`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ECDDC2" /><stop offset="1" stopColor="#D4B78E" /></linearGradient>
        <radialGradient id={`${k}t`} cx=".42" cy=".38" r=".7"><stop offset="0" stopColor="#F4DA98" /><stop offset="1" stopColor="#D6A24A" /></radialGradient>
        <radialGradient id={`${k}l`} cx=".15" cy=".05" r="1"><stop offset="0" stopColor="#fff" stopOpacity=".5" /><stop offset=".6" stopColor="#fff" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="300" height="240" fill={`url(#${k}w)`} />
      <g stroke="#B8946A" strokeOpacity=".28" fill="none" strokeWidth="1.4">
        <path d="M-10 46c80-12 160 14 320-6" /><path d="M-10 112c90-12 170 16 320-4" /><path d="M-10 186c100-12 180 16 320-4" /><path d="M-10 222c60-6 150 10 320-2" />
      </g>
      <g transform="rotate(-9 40 20)">
        <rect x="-70" y="-60" width="180" height="120" rx="12" fill="#C9CED3" />
        <rect x="-60" y="-50" width="160" height="88" rx="7" fill="#B3B9C0" />
        {Array.from({ length: 4 }, (_, r) => Array.from({ length: 8 }, (_, c) => <rect key={`${r}-${c}`} x={-54 + c * 19} y={-44 + r * 19} width="15" height="14" rx="3" fill="#A6ADB5" />))}
        <rect x="8" y="44" width="56" height="10" rx="4" fill="#BCC2C8" />
      </g>
      <ellipse cx="198" cy="152" rx="64" ry="60" fill="#7A5A35" opacity=".16" />
      <circle cx="190" cy="142" r="58" fill="#F7F5EF" stroke="#E3DDD1" strokeWidth="2" />
      <circle cx="190" cy="142" r="41" fill="#FCFBF7" stroke="#E7E1D6" strokeWidth="2.5" />
      <circle cx="190" cy="142" r="33" fill={`url(#${k}t)`} />
      <ellipse cx="179" cy="131" rx="13" ry="6" fill="#fff" opacity=".38" />
      <g fill="#A99145"><ellipse cx="198" cy="150" rx="7" ry="2.6" transform="rotate(28 198 150)" /><ellipse cx="185" cy="155" rx="6" ry="2.2" transform="rotate(-20 185 155)" /><ellipse cx="203" cy="137" rx="5" ry="2" transform="rotate(60 203 137)" /></g>
      <ellipse cx="96" cy="186" rx="34" ry="32" fill="#7A5A35" opacity=".14" />
      <circle cx="90" cy="180" r="30" fill="#F7F5EF" stroke="#E2DCD0" strokeWidth="2" />
      <circle cx="90" cy="180" r="9" fill="#EEEAE0" stroke="#DCD5C7" strokeWidth="1.5" />
      <circle cx="266" cy="58" r="21" fill="#F7F5EF" stroke="#E2DCD0" strokeWidth="2" />
      <circle cx="266" cy="58" r="14.5" fill={`url(#${k}t)`} />
      <g fill="#6E6A3A" opacity=".85"><ellipse cx="128" cy="104" rx="5" ry="1.8" transform="rotate(20 128 104)" /><ellipse cx="136" cy="110" rx="4.4" ry="1.6" transform="rotate(-35 136 110)" /><ellipse cx="122" cy="113" rx="4" ry="1.5" transform="rotate(70 122 113)" /></g>
      <rect width="300" height="240" fill={`url(#${k}l)`} />
    </>
  )
}

function Pitcher({ k }: P) {
  return (
    <>
      <defs>
        <linearGradient id={`${k}b`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FCF3E2" /><stop offset=".55" stopColor="#ECD8B6" /><stop offset="1" stopColor="#D5B78C" /></linearGradient>
        <radialGradient id={`${k}s`} cx=".16" cy=".2" r=".55"><stop offset="0" stopColor="#FFFBEF" /><stop offset="1" stopColor="#FFFBEF" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${k}t`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F3B95C" /><stop offset="1" stopColor="#B4621B" /></linearGradient>
      </defs>
      <rect width="300" height="240" fill={`url(#${k}b)`} />
      <rect width="300" height="240" fill={`url(#${k}s)`} />
      <g stroke="#fff" strokeOpacity=".55" strokeWidth="4"><path d="M44 0v150" /><path d="M0 72h118" /></g>
      <rect y="180" width="300" height="60" fill="#CDA97C" />
      <rect y="180" width="300" height="3" fill="#E9D0A8" />
      <ellipse cx="164" cy="198" rx="58" ry="8" fill="#E58E30" opacity=".35" />
      <path d="M108 104h84l-6 66q-2 12-16 12h-40q-14 0-16-12z" fill={`url(#${k}t)`} opacity=".94" />
      <ellipse cx="150" cy="104" rx="42" ry="4.5" fill="#F8CF83" />
      <path d="M112 68h76q9 0 8 10l-8 92q-2 14-18 14h-40q-16 0-18-14l-8-92q-1-10 8-10z" fill="#fff" fillOpacity=".2" stroke="#fff" strokeOpacity=".9" strokeWidth="2.6" />
      <path d="M104 72l-15-8 3-4 19 8" fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M195 88c30 4 30 60-6 66" fill="none" stroke="#fff" strokeOpacity=".85" strokeWidth="6" strokeLinecap="round" />
      <path d="M120 82l6 84" stroke="#fff" strokeOpacity=".75" strokeWidth="4" strokeLinecap="round" />
      <path d="M232 150h34l-3 28q-1 6-7 6h-14q-6 0-7-6z" fill="#fff" fillOpacity=".25" stroke="#fff" strokeOpacity=".9" strokeWidth="2" />
      <path d="M234 162h30l-2 16q-1 5-6 5h-14q-5 0-6-5z" fill={`url(#${k}t)`} opacity=".9" />
    </>
  )
}

function Thermos({ k }: P) {
  return (
    <>
      <defs>
        <linearGradient id={`${k}b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3D2D23" /><stop offset="1" stopColor="#1E1611" /></linearGradient>
        <radialGradient id={`${k}g`} cx=".86" cy=".04" r=".85"><stop offset="0" stopColor="#FFD58E" stopOpacity=".62" /><stop offset="1" stopColor="#FFD58E" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${k}m`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#7E848A" /><stop offset=".35" stopColor="#E6E9EC" /><stop offset=".6" stopColor="#A7ADB3" /><stop offset="1" stopColor="#5F656B" /></linearGradient>
      </defs>
      <rect width="300" height="240" fill={`url(#${k}b)`} />
      <rect width="300" height="240" fill={`url(#${k}g)`} />
      <rect y="172" width="300" height="68" fill="#5A3F2E" />
      <rect y="172" width="300" height="3" fill="#7C5B42" />
      <ellipse cx="196" cy="192" rx="128" ry="26" fill="#F1B864" opacity=".22" />
      <ellipse cx="98" cy="184" rx="34" ry="6" fill="#000" opacity=".3" />
      <rect x="72" y="62" width="52" height="122" rx="14" fill={`url(#${k}m)`} />
      <rect x="70" y="46" width="56" height="26" rx="9" fill="#464B51" />
      <rect x="72" y="72" width="52" height="5" fill="#2E3236" />
      <rect x="84" y="86" width="5" height="84" rx="2.5" fill="#fff" opacity=".5" />
      <ellipse cx="212" cy="176" rx="66" ry="12" fill="#000" opacity=".25" />
      <path d="M146 150q6-10 66-12t66 12l-4 16q-62 16-124 0z" fill="#E7DCC4" />
      <ellipse cx="212" cy="160" rx="58" ry="17" fill="#6E5131" />
      <ellipse cx="212" cy="156" rx="58" ry="16" fill="#8B6A40" />
      <g stroke="#B08C5C" strokeWidth="2.2" strokeLinecap="round" opacity=".85">
        <path d="M176 152l10-3" /><path d="M192 160l12 2" /><path d="M210 148l9 4" /><path d="M226 162l11-2" /><path d="M240 152l8 4" /><path d="M200 156l5-6" /><path d="M222 154l-6 6" /><path d="M186 162l8 1" />
      </g>
      <g stroke="#5A4128" strokeWidth="2" strokeLinecap="round" opacity=".8"><path d="M182 158l7 2" /><path d="M234 158l-7 3" /><path d="M214 162l6-2" /><path d="M204 150l-6 2" /></g>
      <g fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="2.4" strokeLinecap="round"><path d="M100 40c-6-8 6-12 0-20" /><path d="M112 36c-6-8 6-12 0-20" /></g>
    </>
  )
}

function Meeting({ k }: P) {
  return (
    <>
      <defs>
        <linearGradient id={`${k}b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#EBF0F4" /><stop offset="1" stopColor="#CCD7E0" /></linearGradient>
        <linearGradient id={`${k}d`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8796A3" /><stop offset="1" stopColor="#5E6C79" /></linearGradient>
        <radialGradient id={`${k}t`} cx=".4" cy=".4" r=".7"><stop offset="0" stopColor="#A4561C" /><stop offset="1" stopColor="#5E2A0B" /></radialGradient>
      </defs>
      <rect width="300" height="240" fill={`url(#${k}b)`} />
      <g stroke="#B3C2CE" strokeWidth="3"><path d="M64 0v152" /><path d="M146 0v148" /><path d="M228 0v144" /><path d="M0 40h300" /></g>
      <g stroke="#fff" strokeOpacity=".5" strokeWidth="8"><path d="M20 140L80 0" /><path d="M170 140L222 0" /></g>
      <path d="M0 158l300-20v102H0z" fill={`url(#${k}d)`} />
      <path d="M0 158l300-20" stroke="#A9B6C1" strokeWidth="3" />
      <rect x="28" y="176" width="92" height="58" rx="4" fill="#F4F6F8" transform="rotate(-10 74 205)" />
      <g stroke="#C9D2DA" strokeWidth="2" transform="rotate(-10 74 205)"><path d="M38 190h70" /><path d="M38 202h62" /><path d="M38 214h70" /></g>
      <rect x="112" y="200" width="66" height="5" rx="2.5" fill="#2E3A46" transform="rotate(-22 145 202)" />
      <ellipse cx="206" cy="178" rx="50" ry="13" fill="#000" opacity=".16" />
      <ellipse cx="204" cy="172" rx="48" ry="12" fill="#F7F9FA" stroke="#DCE3E8" strokeWidth="2" />
      <path d="M172 126h64q-2 42-32 44-30-2-32-44z" fill="#FBFCFD" stroke="#DCE3E8" strokeWidth="2" />
      <path d="M236 134c18 0 18 22-2 22" fill="none" stroke="#E3E8EC" strokeWidth="6" strokeLinecap="round" />
      <ellipse cx="204" cy="126" rx="32" ry="7.5" fill={`url(#${k}t)`} />
      <ellipse cx="196" cy="124" rx="10" ry="2.4" fill="#fff" opacity=".3" />
      <g fill="none" stroke="#fff" strokeOpacity=".85" strokeWidth="2.6" strokeLinecap="round"><path d="M194 112c-7-9 7-14 0-24" /><path d="M206 108c-7-9 7-14 0-24" /><path d="M218 112c-7-9 7-14 0-24" /></g>
    </>
  )
}

function Stove({ k }: P) {
  return (
    <>
      <defs>
        <linearGradient id={`${k}b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4C2E21" /><stop offset="1" stopColor="#24150F" /></linearGradient>
        <radialGradient id={`${k}g`} cx=".5" cy=".82" r=".6"><stop offset="0" stopColor="#F59244" stopOpacity=".62" /><stop offset="1" stopColor="#F59244" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${k}c`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#C0703F" /><stop offset="1" stopColor="#7A381A" /></linearGradient>
        <radialGradient id={`${k}k`} cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#5C5650" /><stop offset="1" stopColor="#25211E" /></radialGradient>
      </defs>
      <rect width="300" height="240" fill={`url(#${k}b)`} />
      <rect width="300" height="240" fill={`url(#${k}g)`} />
      <rect y="198" width="300" height="42" fill="#3A2318" />
      <rect y="198" width="300" height="2.5" fill="#5C3A28" />
      <ellipse cx="150" cy="202" rx="70" ry="9" fill="#000" opacity=".3" />
      <path d="M108 126h84l14 74H94z" fill={`url(#${k}c)`} />
      <rect x="104" y="120" width="92" height="10" rx="4" fill="#9A4F28" />
      <rect x="126" y="158" width="48" height="28" rx="10" fill="#1F0E08" />
      <circle cx="140" cy="176" r="6" fill="#F6A34B" /><circle cx="152" cy="173" r="7" fill="#E8682C" /><circle cx="163" cy="178" r="5" fill="#FFD08A" />
      <ellipse cx="150" cy="172" rx="22" ry="10" fill="#FFB25C" opacity=".35" />
      <ellipse cx="150" cy="104" rx="46" ry="30" fill={`url(#${k}k)`} />
      <path d="M110 92q40-18 80 0" fill="none" stroke="#1E1A17" strokeWidth="3" />
      <path d="M116 84q34-56 68 0" fill="none" stroke="#2A2521" strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="150" cy="78" rx="9" ry="5" fill="#3A3530" />
      <path d="M106 104l-24-14 4-5 26 12" fill="#2A2521" />
      <ellipse cx="136" cy="96" rx="12" ry="5" fill="#fff" opacity=".12" />
      <g fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2.6" strokeLinecap="round"><path d="M84 80c-8-10 8-14 0-26" /><path d="M150 64c-8-10 8-14 0-26" /><path d="M162 60c-8-10 8-14 0-24" /></g>
      <path d="M226 180h34q-2 18-17 18t-17-18z" fill="#EADCC4" /><ellipse cx="243" cy="180" rx="17" ry="4" fill="#C77B33" />
      <path d="M252 166h26q-2 14-13 14t-13-14z" fill="#E2D2B6" opacity=".9" /><ellipse cx="265" cy="166" rx="13" ry="3.2" fill="#B86C2A" />
    </>
  )
}

const SCENES: Record<string, (p: P) => React.JSX.Element> = { a_pad1: Desk, a_pad2: Pitcher, a_pad3: Thermos, a_pad4: Meeting, a_pad5: Stove }

/** 一张垫图。slice：铺满容器（裁边）；meet：完整显示 */
export function Pad({ pad, fit = 'slice', align = 'xMid', className }: { pad?: string | null; fit?: 'slice' | 'meet'; align?: 'xMin' | 'xMid' | 'xMax'; className?: string }) {
  const k = `p${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const Scene = SCENES[pad ?? ''] ?? Desk
  return (
    <svg viewBox="0 0 300 240" preserveAspectRatio={`${align}YMid ${fit}`} className={className} role="img" aria-label={PAD_NAMES[pad ?? 'a_pad1']}>
      <Scene k={k} />
    </svg>
  )
}
