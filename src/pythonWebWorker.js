/* eslint-disable no-undef, no-unused-vars */
/* eslint-disable no-restricted-globals */
// pythonWebWorker.js

// Setup your project to serve `pythonWorker.js`. You should also serve
// `pyodide.js`, and all its associated `.asm.js`, `.data`, `.json`,
// and `.wasm` files as well:
importScripts('https://cdn.jsdelivr.net/pyodide/v0.21.3/full/pyodide.js')

const moduleFiles = [
  'pyodideffi.py',
  'simplemodule.py',
  'example/__init__.py',
  'example/example.py'
]

const packages = ['numpy']

const loadFromFile = async (path, basePath = 'python') => {
  const remotePath = `${self.location.protocol}//${self.location.host}`
  const fullFilePath = `${remotePath}/${basePath}/${path}`
  const python = `
    from pyodide.http import pyfetch
    from js import console
    from pathlib import Path

    try:
        response = await pyfetch("${fullFilePath}")
    except Exception as err:
        console.warn("PyScript: Access to local files (using 'paths:' in py-env) is not available when directly opening a HTML file; you must use a webserver to serve the additional files. See https://github.com/pyscript/pyscript/issues/257#issuecomment-1119595062 on starting a simple webserver with Python.")
        raise(err)
    content = await response.bytes()
    out = Path("${path}")
    out.parent.mkdir(exist_ok=True, parents=True)
    out.write_bytes(content)
  `
  await self.pyodide.loadPackagesFromImports(python)
  await self.pyodide.runPythonAsync(python)
}

const loadRequiredPackages = async () => {
  self.pyodide = await loadPyodide()
  for (const file of moduleFiles) {
    // default basePath is 'python', files are loaded from 'pyton/_file_' url
    // equivalent call is:
    // loadFromFile(file, 'python');
    await loadFromFile(file)
  }
  // await python.loadPackage('micropip')  # removing micropip at the moment
  await self.pyodide.loadPackage(packages)
}

const pyodideReadyPromise = loadRequiredPackages()

const postMsg = (msgType, results, id) => {
  const map = new Map()
  map.set('msgType', msgType)
  map.set('results', results)
  map.set('id', id)
  self.postMessage(map)
}

self.onmessage = async (event) => {
  // make sure loading is done
  await pyodideReadyPromise
  // Don't bother yet with this line, suppose our API is built in such a way:
  const { id, type, python, ...context } = event.data
  let results
  try {
    switch (type) {
      case 'module':
        results = await callModuleFunction(python, context)
        break
      case 'script':
      default:
        results = await runScript(python, context)
        break
    }
    postMsg('cb', results, id)
  } catch (error) {
    postMsg('err', error.message, id)
  }
}

const runScript = async function (script, context) {
  // The worker copies the context in its own "memory" (an object mapping name to values)
  for (const key of Object.keys(context)) {
    self[key] = context[key]
  }
  await self.pyodide.loadPackagesFromImports(script)
  return await self.pyodide.runPythonAsync(script)
}

const callModuleFunction = function ({ modulename, funcname }, args) {
  const module = self.pyodide.pyimport(modulename)
  const result = module[funcname](...Object.values(args))
  if (typeof result === 'object') {
    return result.toJs()
  }
  return result
}

export default pyodideReadyPromise
