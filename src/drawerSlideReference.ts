export const accuride3732 = {
  productId: "accuride-t46322g22",
  orderModel: "T46322G22",
  technicalModel: "3732-22",
  name: "Accuride 22 in side-mount drawer slide pair",
  homeDepot: "https://www.homedepot.com/p/202214919",
  lowes:
    "https://www.lowes.com/pd/Richelieu-2-Pack-22-in-Drawer-Slide/1000770534",
  manual:
    "https://www.accuride.com/media/amasty/amfile/attach/a3bcba75b0b82de060a661de95ce9f44.pdf",
  manufacturerCatalog:
    "https://www.accuride.com/media/pdf/ac_ch-product-catalog_v3_0625_.pdf",
  closedLength: 21.65,
  travel: 22,
  height: 1.46,
  minSideGap: 0.5,
  maxSideGap: 0.531,
  maxDrawerWidth: 16,
} as const;

const accurideReviewedAt = "2026-11-21T03:28:00.000Z";
const homeDepot3732Assembly =
  "https://images.thdstatic.com/catalog/pdfImages/02/02904f35-c355-40bb-8bc7-bca1a668da1c.pdf";

function sideMountSize<Size extends 14 | 16 | 18 | 20 | 24>(
  size: Size,
  closedLength: number,
  homeDepotId: string,
) {
  return {
    productId: `accuride-t46322g${size}` as const,
    orderModel: `T46322G${size}`,
    technicalModel: `3732-${size}`,
    name: `Accuride ${size} in side-mount drawer slide pair`,
    homeDepotId,
    homeDepot: `https://www.homedepot.com/p/${homeDepotId}`,
    assembly: homeDepot3732Assembly,
    reviewedAt: accurideReviewedAt,
    manual: accuride3732.manual,
    manufacturerCatalog: accuride3732.manufacturerCatalog,
    closedLength,
    travel: size,
    height: accuride3732.height,
    minSideGap: accuride3732.minSideGap,
    maxSideGap: accuride3732.maxSideGap,
    maxDrawerWidth: accuride3732.maxDrawerWidth,
  };
}

export const otherAccurideSlides = [
  sideMountSize(14, 13.78, "202214900"),
  sideMountSize(16, 15.75, "202214902"),
  sideMountSize(18, 17.72, "202214904"),
  sideMountSize(20, 19.69, "202214906"),
  sideMountSize(24, 23.62, "202214921"),
] as const;

export const drawerSlideProducts = [...otherAccurideSlides, accuride3732]
  .sort((a, b) => a.travel - b.travel);

export type DrawerSlideProduct = (typeof drawerSlideProducts)[number];
export type DrawerSlideProductId = DrawerSlideProduct["productId"];
export const drawerSlideIds = drawerSlideProducts.map(({ productId }) => productId);

export function drawerSlideReference(id: DrawerSlideProductId) {
  return drawerSlideProducts.find((product) => product.productId === id)!;
}
