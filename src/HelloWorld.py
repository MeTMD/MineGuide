from .api.BotAPI import BotAPI
from .Data import MineGuideConfig

def main():
    config = MineGuideConfig(open("mg.config.env"))
    bot = BotAPI(config)
    bot.on_login = lambda: print("Login")
    bot.on_receive_message = lambda x, y: print(f"{x} said {y}")
    bot.connect()

    while True:
        import time

        time.sleep(1)


if __name__ == "__main__":
    main()
