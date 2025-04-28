from javascript import require, On
from .Data import MineGuideConfig

mineflayer = require("mineflayer")
pathfinder = require("mineflayer-pathfinder")


def main():
    config = MineGuideConfig(open("mg.config.env.example"))

    bot = mineflayer.createBot({"host": config.host, "port": config.port, "username": config.username})

    bot.loadPlugin(pathfinder.pathfinder)
    print("Started mineflayer")

    @On(bot, "spawn")
    def handle(*args):
        print("I spawned 👋")
        movements = pathfinder.Movements(bot)

        @On(bot, "chat")
        def handleMsg(this, sender, message, *args):
            print("Got message", sender, message)
            if sender and (sender != config.username):
                bot.chat("Hi, you said " + message)
                if "come" in message:
                    player = bot.players[sender]
                    print("Target", player)
                    target = player.entity
                    if not target:
                        bot.chat("I don't see you !")
                        return

                    pos = target.position
                    bot.pathfinder.setMovements(movements)
                    bot.pathfinder.setGoal(pathfinder.goals.GoalNear(pos.x, pos.y, pos.z, 1))

    @On(bot, "end")
    def handle(*args):
        print("Bot ended!", args)

    while True:
        import time

        time.sleep(1)


if __name__ == "__main__":
    main()
