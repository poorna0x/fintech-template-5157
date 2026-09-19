import type { KarnatakaLocationSeed } from '@/data/karnatakaLocationSeeds';

/**
 * High-intent places for Hassan, Udupi & Mangaluru / Mangalore —
 * industrial sites (HPCL, MRPL, port), city landmarks, and district towns.
 */
export const HASSAN_UDUPI_MANGALURU_LANDMARK_SEEDS: KarnatakaLocationSeed[] = [
  // —— Mangaluru / Mangalore industrial & city ——
  {
    name: 'HPCL Mangaluru',
    district: 'Dakshina Kannada',
    nearby: ['Baikampady', 'Panambur', 'Surathkal', 'Mangaluru', 'MRPL'],
    extraKeywords: [
      'RO service HPCL Mangalore',
      'RO service HPCL Mangaluru',
      'water purifier HPCL Mangalore',
      'industrial RO HPCL Mangalore',
      'RO repair HPCL Refinery Mangalore',
      'RO AMC HPCL Mangaluru',
    ],
  },
  {
    name: 'Baikampady',
    district: 'Dakshina Kannada',
    nearby: ['HPCL Mangaluru', 'Panambur', 'Surathkal', 'Mangaluru', 'Kulai'],
    extraKeywords: [
      'RO service Baikampady',
      'RO service Baikampady Industrial Area',
      'industrial RO Baikampady Mangalore',
      'water purifier Baikampady Mangaluru',
    ],
  },
  {
    name: 'Panambur',
    district: 'Dakshina Kannada',
    nearby: ['Baikampady', 'Surathkal', 'New Mangalore Port', 'Mangaluru', 'HPCL Mangaluru'],
    extraKeywords: [
      'RO service Panambur',
      'RO service Panambur Mangalore',
      'water purifier Panambur Mangaluru',
      'RO repair near New Mangalore Port',
    ],
  },
  {
    name: 'New Mangalore Port',
    district: 'Dakshina Kannada',
    nearby: ['Panambur', 'Baikampady', 'Surathkal', 'Mangaluru'],
    extraKeywords: [
      'RO service New Mangalore Port',
      'RO service NMPT',
      'water purifier Panambur Port',
      'industrial RO Mangalore Port',
    ],
  },
  {
    name: 'MRPL',
    district: 'Dakshina Kannada',
    nearby: ['HPCL Mangaluru', 'Baikampady', 'Surathkal', 'Mangaluru', 'Kulai'],
    extraKeywords: [
      'RO service MRPL Mangalore',
      'RO service MRPL Mangaluru',
      'industrial RO MRPL',
      'water purifier MRPL Refinery',
    ],
  },
  {
    name: 'MSEZ',
    district: 'Dakshina Kannada',
    nearby: ['Baikampady', 'Mangaluru', 'Bajpe', 'Surathkal'],
    extraKeywords: [
      'RO service MSEZ Mangalore',
      'RO service Mangalore SEZ',
      'industrial RO MSEZ',
      'commercial RO Mangalore SEZ',
    ],
  },
  {
    name: 'KIOCL',
    district: 'Dakshina Kannada',
    nearby: ['Panambur', 'Baikampady', 'Mangaluru', 'Surathkal'],
    extraKeywords: ['RO service KIOCL Mangalore', 'industrial RO KIOCL', 'water purifier KIOCL Mangaluru'],
  },
  {
    name: 'Bejai',
    district: 'Dakshina Kannada',
    nearby: ['Kadri', 'Kankanady', 'Hampankatta', 'Mangaluru', 'Balmatta'],
    extraKeywords: ['RO service Bejai Mangalore', 'RO repair Bejai Mangaluru'],
  },
  {
    name: 'Kadri',
    district: 'Dakshina Kannada',
    nearby: ['Bejai', 'Kankanady', 'Mangaluru', 'Falnir', 'Balmatta'],
    extraKeywords: ['RO service Kadri Mangalore', 'water purifier Kadri Mangaluru'],
  },
  {
    name: 'Kankanady',
    district: 'Dakshina Kannada',
    nearby: ['Bejai', 'Kadri', 'Pumpwell', 'Mangaluru', 'Hampankatta'],
    extraKeywords: ['RO service Kankanady', 'RO repair Kankanady Mangalore'],
  },
  {
    name: 'Hampankatta',
    district: 'Dakshina Kannada',
    nearby: ['Balmatta', 'Bejai', 'Mangaluru', 'Falnir', 'Jeppu'],
    extraKeywords: ['RO service Hampankatta', 'RO service Mangalore city centre'],
  },
  {
    name: 'Balmatta',
    district: 'Dakshina Kannada',
    nearby: ['Hampankatta', 'Kadri', 'Mangaluru', 'Bejai'],
    extraKeywords: ['RO service Balmatta Mangalore', 'water purifier Balmatta'],
  },
  {
    name: 'Jeppu',
    district: 'Dakshina Kannada',
    nearby: ['Hampankatta', 'Mangaluru', 'Ullal', 'Bolar'],
    extraKeywords: ['RO service Jeppu Mangalore', 'RO repair Jeppu'],
  },
  {
    name: 'Konaje',
    district: 'Dakshina Kannada',
    nearby: ['Mangaluru', 'Moodbidri', 'Bantwal', 'Deralakatte'],
    extraKeywords: ['RO service Konaje', 'RO service near Mangalore University'],
  },
  {
    name: 'Deralakatte',
    district: 'Dakshina Kannada',
    nearby: ['Konaje', 'Mangaluru', 'Pumpwell', 'Bajpe'],
    extraKeywords: ['RO service Deralakatte', 'water purifier Deralakatte Mangalore'],
  },
  {
    name: 'NITK Surathkal',
    district: 'Dakshina Kannada',
    nearby: ['Surathkal', 'Panambur', 'Baikampady', 'Mangaluru'],
    extraKeywords: [
      'RO service NITK Surathkal',
      'RO service near NITK',
      'water purifier Surathkal campus',
    ],
  },

  // —— Hassan city & district landmarks ——
  {
    name: 'BM Road Hassan',
    district: 'Hassan',
    nearby: ['Hassan', 'Hassan Railway Station', 'Vidyanagar Hassan', 'Dairy Circle Hassan'],
    extraKeywords: [
      'RO service BM Road Hassan',
      'RO service Bangalore Mysore Road Hassan',
      'water purifier BM Road Hassan',
    ],
  },
  {
    name: 'Hassan Railway Station',
    district: 'Hassan',
    nearby: ['Hassan', 'BM Road Hassan', 'Hemavathi Nagar', 'Vidyanagar Hassan'],
    extraKeywords: [
      'RO service near Hassan Railway Station',
      'RO repair Hassan station area',
      'water purifier Hassan city',
    ],
  },
  {
    name: 'Vidyanagar Hassan',
    district: 'Hassan',
    nearby: ['Hassan', 'BM Road Hassan', 'Dairy Circle Hassan', 'Hemavathi Nagar'],
    extraKeywords: ['RO service Vidyanagar Hassan', 'RO repair Vidyanagar Hassan'],
  },
  {
    name: 'Hemavathi Nagar',
    district: 'Hassan',
    nearby: ['Hassan', 'Vidyanagar Hassan', 'Hassan Railway Station', 'BM Road Hassan'],
    extraKeywords: ['RO service Hemavathi Nagar Hassan', 'water purifier Hemavathi Nagar'],
  },
  {
    name: 'Dairy Circle Hassan',
    district: 'Hassan',
    nearby: ['Hassan', 'BM Road Hassan', 'Vidyanagar Hassan', 'Race Course Road Hassan'],
    extraKeywords: ['RO service Dairy Circle Hassan', 'RO repair Dairy Circle Hassan'],
  },
  {
    name: 'Race Course Road Hassan',
    district: 'Hassan',
    nearby: ['Hassan', 'Dairy Circle Hassan', 'BM Road Hassan'],
    extraKeywords: ['RO service Race Course Road Hassan', 'water purifier Race Course Hassan'],
  },
  {
    name: 'Halebidu',
    district: 'Hassan',
    nearby: ['Belur', 'Hassan', 'Chikkamagaluru', 'Sakleshpur'],
    extraKeywords: ['RO service Halebidu', 'RO service Halebid', 'water purifier Halebidu Hassan'],
  },
  {
    name: 'Ramanathapura',
    district: 'Hassan',
    nearby: ['Arkalgud', 'Hassan', 'Holenarasipura', 'Kushalnagar'],
    extraKeywords: ['RO service Ramanathapura', 'RO repair Ramanathapura Hassan'],
  },
  {
    name: 'Gorur',
    district: 'Hassan',
    nearby: ['Hassan', 'Holenarasipura', 'Arkalgud'],
    extraKeywords: ['RO service Gorur Hassan', 'water purifier Gorur Dam area'],
  },
  {
    name: 'Nuggehalli',
    district: 'Hassan',
    nearby: ['Channarayapatna', 'Hassan', 'Shravanabelagola'],
    extraKeywords: ['RO service Nuggehalli', 'RO repair Nuggehalli Hassan'],
  },
  {
    name: 'Konanur',
    district: 'Hassan',
    nearby: ['Arkalgud', 'Hassan', 'Ramanathapura'],
    extraKeywords: ['RO service Konanur Hassan', 'water purifier Konanur'],
  },

  // —— Udupi city & coastal landmarks ——
  {
    name: 'Udupi Temple',
    district: 'Udupi',
    nearby: ['Car Street Udupi', 'Diana Circle', 'Udupi', 'Ambalpady', 'Malpe'],
    extraKeywords: [
      'RO service near Udupi Temple',
      'RO service Udupi Krishna Temple',
      'water purifier Udupi temple area',
      'RO repair Car Street Udupi',
    ],
  },
  {
    name: 'Car Street Udupi',
    district: 'Udupi',
    nearby: ['Udupi Temple', 'Diana Circle', 'Udupi', 'Ambalpady'],
    extraKeywords: ['RO service Car Street Udupi', 'RO repair Car Street Udupi'],
  },
  {
    name: 'Diana Circle',
    district: 'Udupi',
    nearby: ['Udupi', 'Car Street Udupi', 'Kinnimulki', 'Ambalpady'],
    extraKeywords: ['RO service Diana Circle Udupi', 'water purifier Diana Circle'],
  },
  {
    name: 'Ambalpady',
    district: 'Udupi',
    nearby: ['Udupi', 'Diana Circle', 'Manipal', 'Parkala'],
    extraKeywords: ['RO service Ambalpady', 'RO repair Ambalpady Udupi'],
  },
  {
    name: 'Kinnimulki',
    district: 'Udupi',
    nearby: ['Udupi', 'Diana Circle', 'Manipal', 'Parkala'],
    extraKeywords: ['RO service Kinnimulki', 'water purifier Kinnimulki Udupi'],
  },
  {
    name: 'Parkala',
    district: 'Udupi',
    nearby: ['Manipal', 'Udupi', 'Hiriyadka', 'Ambalpady'],
    extraKeywords: ['RO service Parkala', 'RO service Parkala Manipal'],
  },
  {
    name: 'Hiriyadka',
    district: 'Udupi',
    nearby: ['Parkala', 'Manipal', 'Udupi', 'Karkala'],
    extraKeywords: ['RO service Hiriyadka', 'water purifier Hiriyadka Udupi'],
  },
  {
    name: 'Malpe Harbour',
    district: 'Udupi',
    nearby: ['Malpe', 'Udupi', 'Udupi Temple', 'Kaup'],
    extraKeywords: [
      'RO service Malpe Harbour',
      'RO service Malpe Beach',
      'water purifier Malpe Udupi',
    ],
  },
  {
    name: 'Kalyanpura',
    district: 'Udupi',
    nearby: ['Udupi', 'Manipal', 'Brahmavar', 'Ambalpady'],
    extraKeywords: ['RO service Kalyanpura', 'RO repair Kalyanpura Udupi'],
  },
];
