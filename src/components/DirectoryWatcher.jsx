/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
import { useCallback, useEffect, useState } from "react";
// import { directoryOpen } from 'browser-fs-access'
import { importModule } from "../pythonWorker.js";

// browser-fs-access sounds nice on the paper, but cannot provide fileHandle,
// so cannot be aware of changes without another manual intervention from the user


// Functions for file watching
const DURATION_MS = 10 * 1000; // 10s

const FILE_EVENT = {
  ADDED: "ADDED",
  MODIFIED: "MODIFIED",
  DELETED: "DELETED",
};

// Gets all the files recursively from a directory file handle
const getFiles = async (dirHandle, path = dirHandle.name) => {
  const dirs = [];
  const files = [];
  for await (const entry of dirHandle.values()) {
    const nestedPath = `${path}/${entry.name}`;
    if (entry.kind === "file") {
      entry.relativename = nestedPath;
      files.push(entry);
    } else if (entry.kind === "directory") {
      dirs.push(getFiles(entry, recursive, nestedPath, skipDirectory));
    }
  }
  return [...(await Promise.all(dirs)).flat(), ...(await Promise.all(files))];
};

// Check what are the added/modified/removed files
const checkFiles = async function (files) {
  const watched = { directory: files.directory, entries: {} };
  const newFiles = await getFiles(files.directory);

  for (const entry of newFiles) {
    const file = await entry.getFile();
    watched.entries[entry.relativename] = file.lastModified;
  }

  const addedFiles = newFiles.filter((x) => !(x.relativename in files.entries));
  const removedFiles = Object.keys(files.entries).filter(
    (x) => !(x in watched.entries)
  );
  const modifiedFiles = newFiles
    .filter((x) => x.relativename in files.entries)
    .filter((x) => {
      const newtime = watched.entries[x.relativename];
      const oldtime = files.entries[x.relativename];
      return newtime > oldtime;
    });

  return {
    watchedFiles: watched,
    events: [
      ...addedFiles.map((x) => ({ event: FILE_EVENT.ADDED, handle: x })),
      ...modifiedFiles.map((x) => ({ event: FILE_EVENT.MODIFIED, handle: x })),
      ...removedFiles.map((x) => ({ event: FILE_EVENT.DELETED, name: x })),
    ],
  };
};


// Utility function for permissions
async function verifyPermission(fileHandle, readWrite) {
  const options = {};
  if (readWrite) {
    options.mode = "readwrite";
  }
  if ((await fileHandle.queryPermission(options)) === "granted") {
    return true;
  }
  if ((await fileHandle.requestPermission(options)) === "granted") {
    return true;
  }
  return false;
}


// Function that is called on changes
const changeAST = async function (handle) {
  await verifyPermission(handle, true);
  const file = await handle.getFile();
  const content = await file.text();
  const writable = await handle.createWritable();

  const example = importModule("example");
  const res = await example.modify_ast(content);
  await writable.write(res.results);
  await writable.close();
};


// Watcher component
const DirectoryWatcher = () => {
  const [activatedWatch, setActivateWatch] = useState(false);
  const [watchedFiles, setWatchedFiles] = useState({
    directory: null,
    entries: {},
  });

  // Sets the interval for periodical function
  useEffect(() => {
    if (!activatedWatch) {
      return;
    }
    const interval = setInterval(async () => {
      // Check the files
      const { watchedFiles: ws, events } = await checkFiles(watchedFiles);
      // Modify all files that have been modified or added and that have a ".py" extension
      await Promise.all(
        events
          .filter((x) => x.event !== FILE_EVENT.DELETED)
          .filter((x) => x.handle.name.slice(-3) === ".py")
          .map(async (mod) => {
            console.log("Transforming", mod.handle.name);
            await changeAST(mod.handle);
            const handle = mod.handle;
            ws.entries[handle.relativename] = (
              await handle.getFile()
            ).lastModified;
          })
      );
      // Update the new times for the watcher
      setWatchedFiles(ws);
    }, DURATION_MS);

    return () => clearInterval(interval);
  }, [activatedWatch, watchedFiles]);

  // small utility function to show how to call python from JS
  const callMePython = async function () {
    const module = importModule("builtins");
    await module.print("print function called from JS");

    const example = importModule("example");
    await example.evaluate("1 + 1");
    await example.modify_ast("1 + 1");
  };

  // Sets the directory to watch
  const selectDirectoryToWatch = useCallback(async (event) => {
    const directoryHandler = await window.showDirectoryPicker();
    if (!(await verifyPermission(directoryHandler, true))) {
      return;
    }

    const files = await getFiles(directoryHandler);
    const toWatch = {
      directory: directoryHandler,
      entries: {},
    };
    // Creates the "time" map for all watched files
    for (const entry of files) {
      const file = await entry.getFile();
      toWatch.entries[entry.relativename] = file.lastModified;
    }
    setWatchedFiles(toWatch);
    setActivateWatch(true);
  }, []);

  return (
    <div>
      <button onClick={selectDirectoryToWatch}>Watch over directory</button>
      {activatedWatch ? (
        <h3>
          Watching every {DURATION_MS} ms on {watchedFiles.directory.name}
        </h3>
      ) : (
        <></>
      )}
      <pre id="pythonlog" />
      <button onClick={callMePython}>Click me</button>
    </div>
  );
};

export default DirectoryWatcher;
