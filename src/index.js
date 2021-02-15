const blessed = require('blessed')
const contrib = require('blessed-contrib')
const screen = blessed.screen()
const grid = new contrib.grid({rows: 16, cols: 16, screen: screen})
const alertOn = 5 // Alert when stocks change by 5%

screen.render()

const ws = require('websocket')
const dotenv = require('dotenv')
dotenv.config()
const client = new ws.client()
let conn = null;
const metrics = {}
const symbols = (process.env.STOCKS || 'BINANCE:BTCUSDT,AAPL,GME,BB,PLTR,WMT,NET,TWLO,SQ').split(',')
const normalize = (data, bucketSize = 60, _now = null) => {
  const now = _now || (new Date()).getTime()
  const normalizedData = {}
  currentIndex = null
  data.forEach(entry => {
    const index = entry.t > (now - bucketSize * 1000) ? entry.t : Math.floor(entry.t / (bucketSize * 1000)) * bucketSize * 1000 // Keep "bucketsize" seconds unaggregated
    normalizedData[index] = normalizedData[index] || {
      v: 0,
      t: 0,
      p: 0,
      length: 0
    }
    normalizedData[index].v += entry.v
    normalizedData[index].t += entry.t
    normalizedData[index].p += entry.p
    normalizedData[index].length++
  })
  return Object.keys(normalizedData).sort((a,b) => a - b).map(key => {
    const entry = normalizedData[key]
    return {
      v: entry.length ? entry.v / entry.length : 0,
      t: entry.length ? entry.t / entry.length : 0,
      p: entry.length ? entry.p / entry.length : 0,
      length: entry.length
    }
  })

}
client.on('connect', (_conn) => {
  conn = _conn
  console.log('Connected')
  const lastAlerts = {}
 
  conn.on('message', (message) => {
    if (message.type === 'utf8') {
      const data = JSON.parse(message.utf8Data)
      if (!data || !data.data || !data.data.length) {
        return
      }
      try {
        data.data.forEach(metric => {
          metrics[metric.s] = metrics[metric.s] || {data:[]}
          metrics[metric.s].data.push(metric)
          var now = new Date()
          metrics[metric.s].data = metrics[metric.s].data.filter(s => s.t >= (now.getTime() - (60*60*1000))) // Keep one hour of data
          const normalized = metrics[metric.s].data = normalize(metrics[metric.s].data, 60, now.getTime()) // Normalize per minute
          const allPrices = normalized.map(v => v.p)
          metrics[metric.s].line.options.minY = Math.min.apply(Math, allPrices)
          metrics[metric.s].line.options.maxY = Math.max.apply(Math, allPrices)
          const last = normalized[normalized.length - 1]
          const first = normalized[0]
          const pctChange = (metrics[metric.s].line.options.maxY / metrics[metric.s].line.options.minY - 1) * 100
          let hasAlert = false
          if (pctChange >= alertOn) {
            hasAlert = true
            lastAlerts[metric.s] = lastAlerts[metric.s] || 0
            if (lastAlerts[metric.s] < (now.getTime() - 5*60*1000)) { // Allert every 5 minutes
              lastAlerts[metric.s] = now.getTime()
              process.stdout.write('\u0007')
            }
          }
          metrics[metric.s].line.options.style.border = {
            fg: hasAlert ? (last.p < first.p ? 'red' : 'green') : 'cyan'
          }
          metrics[metric.s].line.setLabel((hasAlert ? '\x1b[31m[!!!!!]\x1b[0m ' : '') + metric.s.split(':').pop() + ' $' + last.p.toFixed(4) + ' Vol' + last.v.toFixed(4) + ' MinMax%' + (pctChange).toFixed(2))
          metrics[metric.s].line.setData([
            {
              title: metric.s,
              x: normalized.map(v => v.t),
              y: normalized.map(v => v.p),
              style: {line: last.p < first.p ? 'red' : 'green'}
            }
          ])
          screen.render()

        })
      } catch (e) {console.error(e.message)}
    }
  })


  symbols.forEach((symbol, idx) => {
    metrics[symbol] = metrics[symbol] || {data:[]}
    const col = idx % 4
    const row = Math.floor(idx / 4)
    metrics[symbol].line = 
    grid.set(row * 4, col * 4, 4, 4, contrib.line,
      { style:
        { line: "yellow"
        , text: "green"
        , baseline: "black"}
      , xLabelPadding: 3
      , xPadding: 5
      , label: symbol.split(':').pop()})
      screen.render()
    conn.send(JSON.stringify({
      type: 'subscribe',
      symbol: symbol
    }), (err) => err && console.error(err))
  })
  


 

})

console.log('wss://ws.finnhub.io?token='+process.env.FINNHUB_KEY)
client.connect('wss://ws.finnhub.io?token='+process.env.FINNHUB_KEY)
