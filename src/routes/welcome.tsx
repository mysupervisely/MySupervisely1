import { useEffect } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/welcome')({
  component: WelcomeIntro,
})

export function WelcomeIntro() {
  useEffect(() => {
    const scenes = document.querySelectorAll<HTMLElement>('.wv-scene')
    const dotsEl = document.getElementById('wv-dots-nav')
    const replayBtn = document.getElementById('wv-replay')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (dotsEl) {
      dotsEl.innerHTML = ''
      scenes.forEach(() => {
        const d = document.createElement('div')
        d.className = 'wv-navdot'
        dotsEl.appendChild(d)
      })
    }
    const dots = document.querySelectorAll<HTMLElement>('.wv-navdot')

    const dotSteps: string[][] = [[], ['wv-d-i1', 'wv-d-s1'], ['wv-d-i2', 'wv-d-s2', 'wv-d-i3', 'wv-d-s3'], []]
    const laneSteps: string[][] = [[], ['wv-lane-intern', 'wv-lane-supervisor'], [], []]
    const durations = [3200, 5200, 5200, 999999]

    let timer: ReturnType<typeof setTimeout> | null = null

    function step(i: number) {
      dotSteps[i].forEach((id) => document.getElementById(id)?.classList.add('lit'))
      laneSteps[i].forEach((id) => {
        const el = document.getElementById(id)
        if (el) el.style.strokeDashoffset = '0'
      })
      if (i === 3) {
        document.getElementById('wv-match-node')?.classList.add('lit')
        document.getElementById('wv-match-ring')?.classList.add('lit')
      }
    }

    function showScene(i: number) {
      scenes.forEach((s) => s.classList.toggle('active', s.dataset.i === String(i)))
      dots.forEach((d, idx) => d.classList.toggle('on', idx === i))
      step(i)
      if (i === scenes.length - 1) {
        setTimeout(() => replayBtn?.classList.add('show'), 1200)
        return
      }
      if (!reduced) timer = setTimeout(() => showScene(i + 1), durations[i])
    }

    function restart() {
      replayBtn?.classList.remove('show')
      document.querySelectorAll('.wv-dot').forEach((n) => n.classList.remove('lit'))
      document.getElementById('wv-match-node')?.classList.remove('lit')
      document.getElementById('wv-match-ring')?.classList.remove('lit')
      document.querySelectorAll<HTMLElement>('.wv-lane').forEach((t) => {
        t.style.strokeDashoffset = getComputedStyle(t).strokeDasharray
      })
      if (timer) clearTimeout(timer)
      showScene(0)
    }
    ;(window as unknown as { __wvRestart: () => void }).__wvRestart = restart

    if (reduced) {
      showScene(scenes.length - 1)
      dotSteps.flat().forEach((id) => document.getElementById(id)?.classList.add('lit'))
      laneSteps.flat().forEach((id) => {
        const el = document.getElementById(id)
        if (el) el.style.strokeDashoffset = '0'
      })
      document.getElementById('wv-match-node')?.classList.add('lit')
      document.getElementById('wv-match-ring')?.classList.add('lit')
    } else {
      showScene(0)
    }

    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [])

  return (
    <>
      <style>{`
        .wv-stage { position: relative; width: 100%; min-height: calc(100vh - 64px); background: var(--cream); overflow: hidden; font-family: var(--ff-body); color: var(--bark); }
        .wv-panel-split { position: absolute; inset: 0; z-index: 0; background: linear-gradient(100deg, var(--cream) 0%, var(--cream) 58%, var(--linen) 62%, var(--linen) 100%); }
        .wv-link-layer { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.12; z-index: 1; }
        .wv-lane { fill: none; stroke-width: 1.4; stroke-dasharray: 700; stroke-dashoffset: 700; transition: stroke-dashoffset 2.4s cubic-bezier(.65,0,.35,1); }
        .wv-lane.intern { stroke: var(--sage); }
        .wv-lane.supervisor { stroke: var(--walnut); }
        .wv-dot { r: 4; transition: r .8s ease, opacity .8s ease; opacity: 0.3; }
        .wv-dot.intern { fill: var(--sage); }
        .wv-dot.supervisor { fill: var(--walnut); }
        .wv-dot.lit { r: 6; opacity: 0.55; }
        #wv-match-node { r: 0; fill: var(--bark); transition: r 1s cubic-bezier(.34,1.56,.64,1); }
        #wv-match-node.lit { r: 8; }
        #wv-match-ring { r: 0; fill: none; stroke: var(--clay); stroke-width: 1; opacity: 0; transition: r 1.4s ease, opacity 1.4s ease; }
        #wv-match-ring.lit { r: 26; opacity: 0.6; }
        .wv-scene { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 8vh 8vw; opacity: 0; transform: translateY(14px); transition: opacity 1s ease, transform 1.1s ease; pointer-events: none; }
        .wv-scene.active { opacity: 1; transform: translateY(0); pointer-events: auto; }
        .wv-mark { font-family: var(--ff-body); font-weight: 500; font-size: 0.75rem; letter-spacing: 0.15em; text-transform: uppercase; color: var(--sage); margin-bottom: 1.25rem; }
        .wv-h1 { font-family: var(--ff-display); font-weight: 500; font-size: clamp(28px, 4.8vw, 50px); line-height: 1.2; max-width: 800px; color: var(--bark); letter-spacing: -0.02em; }
        .wv-h1 em { font-style: italic; color: var(--clay); }
        .wv-sub { font-family: var(--ff-body); font-weight: 300; font-size: clamp(15px, 1.6vw, 17px); line-height: 1.7; color: var(--walnut); max-width: 560px; margin-top: 1rem; }
        .wv-lanes-row { display: flex; gap: 40px; margin-top: 2.2rem; justify-content: center; flex-wrap: wrap; }
        .wv-lane-col { width: 200px; text-align: left; }
        .wv-lane-head { font-family: var(--ff-body); font-weight: 500; font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; }
        .wv-lane-head.intern { color: var(--sage); }
        .wv-lane-head.supervisor { color: var(--walnut); }
        .wv-lane-item { font-size: 0.875rem; font-weight: 300; color: var(--walnut); margin-top: 0.75rem; padding-bottom: 0.6rem; border-bottom: 1px solid var(--sand); opacity: 0; transform: translateX(-6px); transition: opacity .6s ease, transform .6s ease; }
        .wv-lane-col.supervisor .wv-lane-item { transform: translateX(6px); }
        .wv-scene.active .wv-lane-item { opacity: 1; transform: translateX(0); }
        .wv-scene.active .wv-lane-item:nth-child(2) { transition-delay: .15s; }
        .wv-scene.active .wv-lane-item:nth-child(3) { transition-delay: .3s; }
        .wv-scene.active .wv-lane-item:nth-child(4) { transition-delay: .45s; }
        .wv-match-card { margin-top: 1.8rem; background: var(--white); border: 1px solid var(--sand); border-radius: 16px; padding: 1.4rem 1.6rem; max-width: 460px; text-align: left; opacity: 0; transform: translateY(10px); transition: opacity .8s ease .3s, transform .8s ease .3s; }
        .wv-scene.active .wv-match-card { opacity: 1; transform: translateY(0); }
        .wv-match-tag { font-family: var(--ff-body); font-weight: 500; font-size: 0.7rem; color: var(--clay); letter-spacing: 0.06em; text-transform: uppercase; }
        .wv-match-row { display: flex; justify-content: space-between; margin-top: 0.75rem; font-size: 0.875rem; }
        .wv-match-side { color: var(--clay); font-weight: 300; }
        .wv-match-name { color: var(--bark); margin-top: 0.15rem; }
        .wv-btn-group { display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center; margin-top: 1.8rem; }
        #wv-replay { position: absolute; top: 1.6rem; right: 1.8rem; z-index: 5; font-family: var(--ff-body); font-weight: 500; font-size: 0.75rem; color: var(--clay); background: none; border: 1.5px solid var(--sand); border-radius: 100px; padding: 0.4rem 0.9rem; cursor: pointer; opacity: 0; pointer-events: none; transition: opacity .6s ease, border-color .2s ease, color .2s ease; }
        #wv-replay.show { opacity: 1; pointer-events: auto; }
        #wv-replay:hover { color: var(--bark); border-color: var(--clay); }
        #wv-dots-nav { position: absolute; bottom: 1.75rem; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; z-index: 5; }
        .wv-navdot { width: 6px; height: 6px; border-radius: 50%; background: var(--sand); transition: background .4s ease; }
        .wv-navdot.on { background: var(--clay); }
        @media (max-width: 600px) { .wv-lanes-row { gap: 20px; } .wv-lane-col { width: 150px; } }
      `}</style>

      <div className="wv-stage">
        <div className="wv-panel-split" />

        <svg className="wv-link-layer" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice">
          <path id="wv-lane-intern" className="wv-lane intern" d="M 60 160 C 260 160, 380 300, 500 300" />
          <path id="wv-lane-supervisor" className="wv-lane supervisor" d="M 940 160 C 740 160, 620 300, 500 300" />
          <circle className="wv-dot intern" id="wv-d-i1" cx="60" cy="160" />
          <circle className="wv-dot intern" id="wv-d-i2" cx="140" cy="120" />
          <circle className="wv-dot intern" id="wv-d-i3" cx="220" cy="90" />
          <circle className="wv-dot supervisor" id="wv-d-s1" cx="940" cy="160" />
          <circle className="wv-dot supervisor" id="wv-d-s2" cx="860" cy="120" />
          <circle className="wv-dot supervisor" id="wv-d-s3" cx="780" cy="90" />
          <circle id="wv-match-ring" cx="500" cy="300" />
          <circle id="wv-match-node" cx="500" cy="300" />
        </svg>

        <button id="wv-replay" onClick={() => (window as unknown as { __wvRestart?: () => void }).__wvRestart?.()}>
          Replay
        </button>

        <div className="wv-scene" data-i="0">
          <div className="wv-mark">Mental health supervision, reimagined</div>
          <h1 className="wv-h1">
            Welcome to <em>MySupervisely</em>.
          </h1>
        </div>

        <div className="wv-scene" data-i="1">
          <div className="wv-mark">The gap</div>
          <h1 className="wv-h1">
            Getting licensed takes supervised hours. Getting there takes <em>the right supervisor.</em>
          </h1>
          <p className="wv-sub">
            We connect interns working toward licensure with qualified supervisors across LMHC, LCSW, and LMFT — matched on goals, style, and career vision, not just zip code.
          </p>
        </div>

        <div className="wv-scene" data-i="2">
          <div className="wv-mark">Two sides, one platform</div>
          <h1 className="wv-h1">Built for both sides of supervision.</h1>
          <div className="wv-lanes-row">
            <div className="wv-lane-col intern">
              <div className="wv-lane-head intern">For interns</div>
              <div className="wv-lane-item">Find supervisors by license type</div>
              <div className="wv-lane-item">Track your supervised hours</div>
              <div className="wv-lane-item">Message and schedule directly</div>
            </div>
            <div className="wv-lane-col supervisor">
              <div className="wv-lane-head supervisor">For supervisors</div>
              <div className="wv-lane-item">Set your availability and rates</div>
              <div className="wv-lane-item">Review intern applications</div>
              <div className="wv-lane-item">Sign off on hours, built in</div>
            </div>
          </div>
        </div>

        <div className="wv-scene" data-i="3">
          <div className="wv-mark">You're ready to begin</div>
          <h1 className="wv-h1">
            Find the supervisor who <em>fits your path.</em>
          </h1>
          <p className="wv-sub">Whether you're logging hours or offering them, your match is waiting on the other side.</p>
          <div className="wv-btn-group">
            <Link to="/interns" className="btn-primary">
              I'm an intern
            </Link>
            <Link to="/supervisors" className="btn-secondary">
              I'm a supervisor
            </Link>
          </div>
        </div>

        <div id="wv-dots-nav" />
      </div>
    </>
  )
}
