import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [hostInfo, setHostInfo] = useState({
    domain: '',
    port: '',
    accessType: ''
  })

  useEffect(() => {
    const location = window.location
    const hostname = location.hostname

    // Determine access type based on domain
    let accessType = ''
    if (hostname.includes('public-frontend')) {
      accessType = 'public으로 접속하셨네요'
    } else if (hostname.includes('private-frontend')) {
      accessType = 'private-frontend.choilab.xyz'
    } else {
      accessType = '알 수 없는 도메인입니다'
    }

    setHostInfo({
      domain: hostname,
      port: location.port || (location.protocol === 'https:' ? '443' : '80'),
      accessType: accessType
    })
  }, [])

  return (
    <div className="App">
      <div className="info-container">
        <div className="info-item">
          <div className="info-label">Access Type</div>
          <div className="info-value access-type">{hostInfo.accessType}</div>
        </div>

        <div className="info-item">
          <div className="info-label">Domain</div>
          <div className="info-value">{hostInfo.domain}</div>
        </div>

        <div className="info-item">
          <div className="info-label">Port</div>
          <div className="info-value">{hostInfo.port}</div>
        </div>
      </div>
    </div>
  )
}

export default App
