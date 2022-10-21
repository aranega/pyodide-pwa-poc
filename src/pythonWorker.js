/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
const pyodideWorker = new Worker(new URL('./pythonWebWorker.js', import.meta.url))

const callbacks = {}

pyodideWorker.onmessage = (event) => {
  const { msgType, id, msg, ...data } = Object.fromEntries(event.data)
  const logEl = document.getElementById('pythonlog')
  let onSuccess
  switch (msgType) {
    case 'cb':
      onSuccess = callbacks[id]
      delete callbacks[id]
      onSuccess(data)
      break
    case 'err':
      console.log('error:', data.results)
      break
    case 'log':
      logEl.innerHTML += '\n' + msg
      break
    default:
      console.log(`default: ${msgType} -- ${msg}`)
  }
}

const asyncRun = (() => {
  let id = 0 // identify a Promise
  return (script, context) => {
    // the id could be generated more carefully
    id = (id + 1) % Number.MAX_SAFE_INTEGER
    return new Promise((resolve, reject) => {
      callbacks[id] = resolve
      pyodideWorker.postMessage({
        ...context,
        python: script,
        type: 'script',
        id
      })
    })
  }
})()

// We build a proxy that catch all calls towards itself
// and transform calls in a message towards the python web worker
class AsyncPythonModule {
  constructor (modulename, id) {
    this.name = modulename
    this.id = id
    this.count = 0
    return new Proxy(this, {
      get (instance, key) {
        if (key in instance) {
          return Reflect.get(instance, key)
        }
        // if the key doesn't exist, we build a proxy
        // for the method
        return new Proxy(() => {}, {
          apply: (_, thisArg, argumentsList) => {
            instance.count += 1 % Number.MAX_SAFE_INTEGER
            const callid = `module_${instance.id}_${instance.count}`
            return new Promise((resolve, reject) => {
              callbacks[callid] = resolve
              pyodideWorker.postMessage({
                ...argumentsList,
                python: {
                  modulename: instance.name,
                  funcname: key
                },
                type: 'module',
                id: callid
              })
            })
          }
        })
      }
    })
  }
}

const importModule = (() => {
  let id = 0
  return (modulename) => {
    id = (id + 1) % Number.MAX_SAFE_INTEGER
    return new AsyncPythonModule(modulename, id)
  }
})()

export { asyncRun, importModule }
