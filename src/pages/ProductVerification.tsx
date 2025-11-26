import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Package, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';
import { useTheme } from '@/contexts/ThemeContext';

interface ProductQrCodeData {
  id: string;
  name: string;
  qr_code_url: string;
  product_image_url?: string;
  product_name?: string;
  product_description?: string;
  product_mrp?: string;
}

const ProductVerification: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { isDarkMode } = useTheme();
  const [productQrCode, setProductQrCode] = useState<ProductQrCodeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProductQrCode = async () => {
      if (!id) {
        setError('Invalid product QR code ID');
        setLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('product_qr_codes')
          .select('id, name, qr_code_url, product_image_url, product_name, product_description, product_mrp')
          .eq('id', id)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        if (data) {
          setProductQrCode(data);
        } else {
          setError('Product QR code not found');
        }
      } catch (err: any) {
        console.error('Error loading product QR code:', err);
        setError(err.message || 'Failed to load product information');
      } finally {
        setLoading(false);
      }
    };

    loadProductQrCode();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Verifying product...</p>
        </div>
      </div>
    );
  }

  if (error || !productQrCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm bg-card border border-border shadow-sm">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <XCircle className="w-6 h-6 text-destructive" />
              </div>
              <h2 className="text-lg font-semibold text-card-foreground mb-1">Product Not Found</h2>
              <p className="text-sm text-muted-foreground">{error || 'The requested product QR code could not be found.'}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative">
      {/* GENUINE Watermark Pattern - Small repeating text */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div 
          className="absolute inset-0 opacity-[0.04] dark:opacity-[0.06]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              45deg,
              transparent,
              transparent 80px,
              hsl(var(--primary) / 0.1) 80px,
              hsl(var(--primary) / 0.1) 81px
            )`,
          }}
        />
        {/* Small GENUINE text repeating pattern */}
        <div 
          className="absolute inset-0 text-primary/5 dark:text-primary/8"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='150' height='150' xmlns='http://www.w3.org/2000/svg'%3E%3Ctext x='10' y='30' font-family='system-ui, sans-serif' font-size='12' font-weight='700' fill='currentColor' opacity='0.4' transform='rotate(-45 75 75)'%3EGENUINE%3C/text%3E%3Ctext x='10' y='60' font-family='system-ui, sans-serif' font-size='12' font-weight='700' fill='currentColor' opacity='0.4' transform='rotate(-45 75 75)'%3EGENUINE%3C/text%3E%3Ctext x='10' y='90' font-family='system-ui, sans-serif' font-size='12' font-weight='700' fill='currentColor' opacity='0.4' transform='rotate(-45 75 75)'%3EGENUINE%3C/text%3E%3Ctext x='10' y='120' font-family='system-ui, sans-serif' font-size='12' font-weight='700' fill='currentColor' opacity='0.4' transform='rotate(-45 75 75)'%3EGENUINE%3C/text%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat',
          }}
        />
      </div>
      
      <Header />
      <div className="p-3 sm:p-4 relative z-10">
        <div className="w-full max-w-sm mx-auto">
          {/* Verification Card */}
          <Card className="bg-card/95 backdrop-blur-sm border-2 border-primary/30 shadow-xl overflow-hidden rounded-xl relative z-10">
            <CardContent className="p-0">
              {/* Header Banner - Genuine Product */}
              <div className="bg-gradient-to-r from-primary to-primary/90 text-primary-foreground px-3 py-5 sm:px-4 sm:py-6 md:py-8">
                <div className="flex flex-col items-center justify-center">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full bg-primary-foreground/20 backdrop-blur-sm flex items-center justify-center mb-3 sm:mb-4 border-4 border-primary-foreground/30">
                    <CheckCircle className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 text-primary-foreground rounded-full" />
                  </div>
                  <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-primary-foreground text-center mb-1 sm:mb-2">
                    GENUINE PRODUCT
                  </h1>
                  <p className="text-xs sm:text-sm md:text-base text-primary-foreground/90 text-center">
                    Verified Authentic
                  </p>
                </div>
              </div>

              {/* Product Information */}
              <div className="px-3 py-4 sm:px-4 sm:py-5 md:py-6">
                <div className="space-y-3 sm:space-y-4">
                  {/* Product Image - Only show if provided */}
                  {productQrCode.product_image_url && (
                    <div className="flex justify-center mb-3 sm:mb-4">
                      <div className="relative w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 rounded-full border-4 border-primary/30 shadow-lg overflow-hidden">
                        <img
                          src={productQrCode.product_image_url}
                          alt={productQrCode.product_name || productQrCode.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* QR Code Name - Always show */}
                  <div className="space-y-1 sm:space-y-2">
                    <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide">Product Identifier</p>
                    <p className="text-sm sm:text-base md:text-lg font-semibold text-card-foreground break-words">{productQrCode.name}</p>
                  </div>

                  {/* Product Name - Only show if provided */}
                  {productQrCode.product_name && (
                    <div className="space-y-1 sm:space-y-2 pt-2 border-t border-border">
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
                        <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                        <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide">Product Name</p>
                      </div>
                      <p className="text-sm sm:text-base md:text-lg font-semibold text-card-foreground break-words">
                        {productQrCode.product_name}
                      </p>
                    </div>
                  )}

                  {/* MRP - Only show if provided */}
                  {productQrCode.product_mrp && (
                    <div className="space-y-1 sm:space-y-2 pt-2 border-t border-border">
                      <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide">MRP</p>
                      <p className="text-base sm:text-lg md:text-xl font-bold text-primary break-words">
                        {productQrCode.product_mrp.startsWith('₹') || productQrCode.product_mrp.startsWith('Rs') || productQrCode.product_mrp.startsWith('rs') 
                          ? productQrCode.product_mrp 
                          : `₹${productQrCode.product_mrp}`}
                      </p>
                    </div>
                  )}

                  {/* Product Description - Only show if provided */}
                  {productQrCode.product_description && (
                    <div className="space-y-1 sm:space-y-2 pt-2 border-t border-border">
                      <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide">Product Description</p>
                      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed break-words">
                        {productQrCode.product_description}
                      </p>
                    </div>
                  )}

                  {/* Verification Badge */}
                  <div className="pt-3 sm:pt-4 flex justify-center">
                    <Badge className="bg-primary text-primary-foreground px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm rounded-full">
                      <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 rounded-full" />
                      Authenticated Product
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Footer Note */}
              <div className="bg-primary/5 px-3 py-2.5 sm:px-4 sm:py-3 md:py-4 border-t border-border">
                <p className="text-[9px] sm:text-[10px] md:text-xs text-muted-foreground text-center leading-relaxed">
                  This product has been verified as genuine. If you have any concerns, please contact the manufacturer.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ProductVerification;

