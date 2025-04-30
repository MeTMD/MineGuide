from typing import Callable, Optional

from javascript import On

from . import JavascriptObject, mineflayer, pathfinder
from .ClassesAPI import Vector3, Block
from ..Data import MineGuideConfig


class BotStateException(Exception):
    def __init__(self, *args):
        super().__init__(*args)


class BotAPI:
    """The interface to create and manipulate a Minecraft robot
    to interact with the Minecraft world via Mineflayer API.
    """

    def __init__(self, config: MineGuideConfig):
        self._config: MineGuideConfig = config
        self._connected: bool = False
        self._mvm_set: bool = False

        self.on_login: Optional[Callable[[], None]] = None
        self.on_quit: Optional[Callable[[str], None]] = None
        self.on_spawn: Optional[Callable[[], None]] = None
        self.on_death: Optional[Callable[[], None]] = None
        self.on_receive_message: Optional[Callable[[str, str], None]] = None
        self.on_player_joined: Optional[Callable[[str], None]] = None
        self.on_player_left: Optional[Callable[[str], None]] = None

    def _assert_connected(self):
        if not self._connected:
            raise BotStateException("Bot has not connected yet")

    def _assert_disconnected(self):
        if self._connected:
            raise BotStateException("Bot already connected")

    def connect(self):
        self._assert_disconnected()
        self._bot: JavascriptObject = mineflayer.createBot(
            {"host": self._config.host, "port": self._config.port, "username": self._config.username}
        )
        self._bot.loadPlugin(pathfinder.pathfinder)
        _register_listeners(self, self._bot)

    def do_chat(self, message: str):
        self._assert_connected()
        self._bot.chat(message)

    def do_whisper(self, receiver_name: str, message: str):
        self._assert_connected()
        self._bot.whisper(receiver_name, message)

    def do_move_to_pos(self, pos: Vector3):
        self._assert_connected()
        return self.do_move_to_xyz(pos.x, pos.y, pos.z)

    def do_move_to_xyz(self, x: float, y: float, z: float):
        self._assert_connected()
        if not self._mvm_set:
            mvm = pathfinder.Movements(self._bot)
            setattr(mvm, "canDig", False)
            self._bot.pathfinder.setMovements(mvm)
            self._mvm_set = True
        self._bot.pathfinder.setGoal(pathfinder.goals.GoalNear(x, y, z, 1))

    def query_block_at(self, pos: Vector3):
        return Block(self._bot.blockAt(pos.as_raw()))

    def query_can_see_block(self, block: Block):
        return self._bot.canSeeBlock(block.as_raw()) is True

    def query_self_position(self):
        return Vector3(self._bot.entity.position)

    def query_player_position(self, player_name: str):
        return Vector3(self._bot.players[player_name].entity.position)


def _register_listeners(api: BotAPI, bot: JavascriptObject):
    @On(bot, "chat")
    def chat(this, sender_name: str, message: str, *args):
        if api.on_receive_message and sender_name != bot.username:
            api.on_receive_message(sender_name, message)

    @On(bot, "whisper")
    def whisper(this, sender_name: str, message: str, *args):
        if api.on_receive_message and sender_name != bot.username:
            api.on_receive_message(sender_name, message)

    @On(bot, "login")
    def login(this):
        api._connected = True
        if api.on_login:
            api.on_login()

    @On(bot, "end")
    def end(this, reason: str):
        api._connected = False
        if api.on_quit:
            api.on_quit(reason)

    @On(bot, "spawn")
    def spawn(this):
        if api.on_spawn:
            api.on_spawn()

    @On(bot, "death")
    def death(this):
        if api.on_death:
            api.on_death()

    @On(bot, "playerJoined")
    def playerJoined(this, player: JavascriptObject):
        if api.on_player_joined and player.username != bot.username:
            api.on_player_joined(str(player.username))

    @On(bot, "playerLeft")
    def playerLeft(this, player: JavascriptObject):
        if api.on_player_left and player.username != bot.username:
            api.on_player_left(str(player.username))
