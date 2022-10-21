try:
    from js import postMessage as _post_message  # type: ignore
    from pyodide.ffi import to_js  # type: ignore

    PYODIDE_RUN = True
except ImportError:
    PYODIDE_RUN = False

if PYODIDE_RUN:

    def post_message(**kwargs):
        _post_message(to_js(kwargs))

else:

    def post_message(**kwargs):
        msgType = kwargs["msgType"]
        msg = kwargs["msg"]
        print(f"[{msgType}]", msg)


def log(text: str):
    post_message(msgType="log", msg=text)
