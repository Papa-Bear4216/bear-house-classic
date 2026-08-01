// Amazon "send to cart" helper — no Product Advertising API access yet (the
// household's Associates account hasn't hit the 3-qualifying-sale threshold),
// so this can't pre-fill a real cart with exact ASINs. Instead it opens an
// Amazon search results page per item, tagged with the household's own
// Associates ID so any resulting purchases count toward PA-API qualification.
//
// UPGRADE PATH: once PA-API access is granted, a server route can resolve
// each item name to a real ASIN + pack size and build a true
// amazon.com/gp/aws/cart/add.html?ASIN.1=...&Quantity.1=... URL instead.

const AMAZON_ASSOCIATE_TAG = 'hotmessexp0d4-20';

export function amazonSearchUrl(itemName: string): string {
  const params = new URLSearchParams({ k: itemName, tag: AMAZON_ASSOCIATE_TAG });
  return `https://www.amazon.com/s?${params.toString()}`;
}

export function openAmazonSearch(itemName: string): void {
  window.open(amazonSearchUrl(itemName), '_blank', 'noopener,noreferrer');
}

/**
 * Opens one Amazon search tab per item name, one at a time, gated behind a
 * "next" step rather than firing all at once — browsers block most
 * auto-opened tabs beyond the first as popup spam, and a single combined
 * search query (all names ANDed together) would return no useful results.
 * Returns a controller so the caller (a small confirm UI) can drive it.
 */
export function createAmazonSendQueue(itemNames: string[]): {
  remaining: string[];
  openNext: () => string | null; // returns the item name just opened, or null when done
} {
  const remaining = [...itemNames];
  return {
    remaining,
    openNext: () => {
      const next = remaining.shift();
      if (!next) return null;
      openAmazonSearch(next);
      return next;
    },
  };
}
