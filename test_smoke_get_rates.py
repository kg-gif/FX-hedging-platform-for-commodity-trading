import asyncio
from birk_api import get_current_rates

async def main():
    pairs = ["EUR/USD"]
    try:
        res = await get_current_rates(pairs)
        print("Result:", res)
        print("Type of value for pair:", type(res.get("EUR/USD")))
    except Exception as e:
        print("Error calling get_current_rates:", e)

if __name__ == '__main__':
    asyncio.run(main())
