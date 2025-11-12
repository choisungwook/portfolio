# CSS GetHost - Domain and IP Information Checker

A React web application built with VITE that displays current domain and client IP information.

## Getting Started

```bash
npm install
npm run dev
```

## Technical Implementation

### 1. Host Information Retrieval

#### Domain/Hostname

```javascript
const domain = window.location.hostname
const fullHost = window.location.host
```

- `window.location.hostname`: Pure domain name (e.g., `localhost`, `example.com`)
- `window.location.host`: Full host including port (e.g., `localhost:3000`)

#### Port

```javascript
const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80')
```

- Uses explicit port if available
- Falls back to default ports based on protocol (HTTP: 80, HTTPS: 443)

#### Protocol

```javascript
const protocol = window.location.protocol
```

- Retrieved directly from browser's `window.location.protocol` (e.g., `http:`, `https:`)

### 2. Client IP Address Retrieval

#### External API Usage

```javascript
const response = await fetch('https://api.ipify.org?format=json')
const data = await response.json()
const clientIP = data.ip
```

**Why use external API?**

- Browser JavaScript cannot directly access client's real IP address for security reasons
- NAT/Proxy environments only show internal IP addresses
- External services are required to determine public IP address

#### Alternative Methods

1. **WebRTC Usage** (can retrieve local IP)
2. **Server-side Implementation** (extract IP from request headers)
3. **Other IP Services** (ipinfo.io, httpbin.org, etc.)

### 3. Additional Information

#### User Agent

```javascript
const userAgent = navigator.userAgent
```

- Provides browser and OS information
- Useful for debugging and environment identification

## Key Features

- **Real-time Information Display**: Automatically collects all information on page load
- **IP Refresh**: Button to re-fetch external IP address
- **Responsive Design**: Works on mobile devices
- **Error Handling**: Shows appropriate messages when network errors occur

## Use Cases

- Checking host information in local development environment
- Identifying actual connection details in proxy/load balancer environments
- Network configuration debugging
- Current domain verification in multi-domain environments

## Project Structure

```
css_getHost/
├── src/
│   ├── App.jsx          # Main component with host/IP detection logic
│   ├── App.css          # Component styling
│   ├── main.jsx         # React entry point
│   └── index.css        # Global styles
├── index.html           # HTML template
├── vite.config.js       # VITE configuration
└── package.json         # Project dependencies
```

## Dependencies

- **React 18.2.0**: UI library
- **VITE 5.2.0**: Build tool and development server
- **ipify.org API**: External service for IP address detection

## Browser Compatibility

- Modern browsers supporting ES6+ features
- Requires internet connection for external IP detection
- Works in both HTTP and HTTPS environments
