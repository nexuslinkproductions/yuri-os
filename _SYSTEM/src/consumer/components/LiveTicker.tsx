import { useState, useEffect } from 'react'

const LiveTicker = () => {
  const [time, setTime] = useState('')

  useEffect(() => {
    const updateTime = () => {
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Vienna',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
      setTime(formatter.format(new Date()))
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="nlp-live-ticker" role="status" aria-live="off">
      <span className="nlp-live-dot" aria-hidden="true"></span>
      <span>VIE · {time} · ONLINE</span>
    </div>
  )
}

export default LiveTicker
