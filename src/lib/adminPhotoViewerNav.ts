export type AdminPhotoViewerSelection = {
  url: string;
  index: number;
  total: number;
};

export function resolveAdminPhotoViewerSources(ctx: {
  selectedBillPhotos: string[] | null;
  selectedCustomerPhotos: string[] | null;
  selectedJobPhotos: { photos: string[] } | null;
}): string[] | null {
  if (ctx.selectedBillPhotos && ctx.selectedBillPhotos.length > 0) {
    return ctx.selectedBillPhotos;
  }
  if (ctx.selectedCustomerPhotos && ctx.selectedCustomerPhotos.length > 0) {
    return ctx.selectedCustomerPhotos;
  }
  if (ctx.selectedJobPhotos?.photos) {
    return ctx.selectedJobPhotos.photos;
  }
  return null;
}

export function getAdjacentAdminPhotoIndex(
  currentIndex: number,
  total: number,
  direction: 'prev' | 'next'
): number {
  if (direction === 'prev') {
    return currentIndex > 0 ? currentIndex - 1 : total - 1;
  }
  return currentIndex < total - 1 ? currentIndex + 1 : 0;
}

export function buildAdminPhotoViewerSelection(
  photos: string[],
  direction: 'prev' | 'next',
  current: AdminPhotoViewerSelection
): AdminPhotoViewerSelection {
  const newIndex = getAdjacentAdminPhotoIndex(current.index, photos.length, direction);
  return {
    url: photos[newIndex],
    index: newIndex,
    total: photos.length,
  };
}
