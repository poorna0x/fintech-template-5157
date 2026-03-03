import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export const useBrandsAndModels = () => {
  const [dbBrands, setDbBrands] = useState<string[]>([]);
  const [dbModels, setDbModels] = useState<string[]>([]);

  const loadBrandsAndModels = useCallback(async () => {
    try {
      // OPTIMIZATION: Fetch all 4 queries in parallel instead of sequentially
      const [customerBrandsResult, jobBrandsResult, customerModelsResult, jobModelsResult] = await Promise.all([
        supabase
          .from('customers')
          .select('brand')
          .not('brand', 'is', null)
          .neq('brand', '')
          .neq('brand', 'Not specified')
          .limit(1000),
        supabase
          .from('jobs')
          .select('brand')
          .not('brand', 'is', null)
          .neq('brand', '')
          .neq('brand', 'Not specified')
          .limit(1000),
        supabase
          .from('customers')
          .select('model')
          .not('model', 'is', null)
          .neq('model', '')
          .neq('model', 'Not specified')
          .limit(1000),
        supabase
          .from('jobs')
          .select('model')
          .not('model', 'is', null)
          .neq('model', '')
          .neq('model', 'Not specified')
          .limit(1000)
      ]);
      
      // Only process if all queries succeeded
      if (!customerBrandsResult.error && !jobBrandsResult.error && 
          !customerModelsResult.error && !jobModelsResult.error) {
        // Extract all brands (handle comma-separated values)
        const allBrands = new Set<string>();
        [...(customerBrandsResult.data || []), ...(jobBrandsResult.data || [])].forEach(item => {
          if (item.brand) {
            item.brand.split(',').forEach((b: string) => {
              const trimmed = b.trim();
              if (trimmed && trimmed !== 'Not specified') {
                allBrands.add(trimmed);
              }
            });
          }
        });
        
        // Extract all models (handle comma-separated values)
        const allModels = new Set<string>();
        [...(customerModelsResult.data || []), ...(jobModelsResult.data || [])].forEach(item => {
          if (item.model) {
            item.model.split(',').forEach((m: string) => {
              const trimmed = m.trim();
              if (trimmed && trimmed !== 'Not specified') {
                allModels.add(trimmed);
              }
            });
          }
        });
        
        setDbBrands(Array.from(allBrands));
        setDbModels(Array.from(allModels));
      }
    } catch (error) {
      console.error('Error loading brands and models:', error);
    }
  }, []);

  return {
    dbBrands,
    dbModels,
    loadBrandsAndModels
  };
};

