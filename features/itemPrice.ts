import { Hono } from "hono";
import { idleGet } from "../lib/api.ts";

interface PriceEntry {
  price: number;
  quantity: number;
}

interface ComprehensivePrice {
  lowestSellPrices: PriceEntry[];
  highestBuyPrices: PriceEntry[];
  averagePriceLastDay: number | null;
  averagePriceLastWeek: number | null;
  averagePriceLastMonth: number | null;
  transactionVolumeLastDay: number | null;
}

const itemPrice = new Hono();

itemPrice.get("/:itemId", async (c) => {
  const itemId = c.req.param("itemId");

  if (isNaN(Number(itemId))) {
    return c.json({ error: "itemId must be a number" }, 400);
  }

  try {
    const data = await idleGet<ComprehensivePrice>(
      `/api/PlayerMarket/items/prices/latest/comprehensive/${itemId}`
    );

    return c.json({
      itemId: Number(itemId),
      lowestSell: data.lowestSellPrices[0]?.price ?? null,
      highestBuy: data.highestBuyPrices[0]?.price ?? null,
      avgDay: data.averagePriceLastDay,
      avgWeek: data.averagePriceLastWeek,
      volumeDay: data.transactionVolumeLastDay,
    });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default itemPrice;
