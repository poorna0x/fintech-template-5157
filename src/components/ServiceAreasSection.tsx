import { Card, CardContent } from '@/components/ui/card';
import { bengaluruAreas, uniquePincodes } from '@/data/bengaluru-areas';

const ServiceAreasSection = () => {
  return (
    <section id="service-areas" className="py-12 px-4 md:px-12 bg-background">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <span className="inline-block text-sm font-semibold text-sky-700 dark:text-sky-400 mb-3">
            Service areas
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            We cover all of Bengaluru
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Every area, every pincode — find yours and book in seconds.
          </p>
        </div>

        {/* Quick Stats - Visible to users */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4 max-w-4xl mx-auto">
          {[
            { value: bengaluruAreas.length, label: 'Areas Covered' },
            { value: uniquePincodes.length, label: 'Pincodes Served' },
            { value: '24/7', label: 'Emergency Service' },
            { value: '100%', label: 'Bengaluru Coverage' },
          ].map((stat) => (
            <Card key={stat.label} className="text-center border-sky-100 dark:border-sky-500/15 bg-white/60 dark:bg-card/50">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-sky-700 dark:text-sky-400">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

      </div>
    </section>
  );
};

export default ServiceAreasSection;
