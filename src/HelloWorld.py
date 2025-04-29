from .api.BotAPI import BotAPI
from .Data import MineGuideConfig

def handle_msg(bot: BotAPI, username: str, message: str):
    if "where" in message:
        pos = bot.query_self_position()
        print("Currently at", pos)
        pos.y -= 1
        block = bot.query_block_at(pos)
        print("Block under bot is", block)
        print("Bot see that is", bot.query_can_see_block(block))
    else:
        print(f"{username} said {message}")

def main():
    config = MineGuideConfig(open("mg.config.env"))
    bot = BotAPI(config)
    bot.on_login = lambda: print("Login")
    bot.on_receive_message = lambda x, y: handle_msg(bot, x, y)
    bot.connect()

    while True:
        import time

        time.sleep(1)


if __name__ == "__main__":
    main()
