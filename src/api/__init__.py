from typing import Any, Union

from javascript import require


class JavascriptObject:
    """For type hinting only."""

    def __call__(self, *args: Any, **kwargs: Any) -> "JavascriptObject":
        raise NotImplementedError()

    def __getattr__(self, *args: Any, **kwargs: Any) -> Union["JavascriptObject", Any]:
        raise NotImplementedError()

    def __getitem__(self, *args: Any, **kwargs: Any) -> Union["JavascriptObject", Any]:
        raise NotImplementedError()

mineflayer: JavascriptObject = require("mineflayer")
pathfinder: JavascriptObject = require("mineflayer-pathfinder")
