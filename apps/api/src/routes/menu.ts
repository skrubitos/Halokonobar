import type { FastifyInstance } from 'fastify';
import { getPool } from '@halokonobar/db';

export async function menuRoutes(fastify: FastifyInstance) {
  // GET /api/v1/clubs/:club_id/menu
  fastify.get<{ Params: { club_id: string } }>(
    '/clubs/:club_id/menu',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const pool = getPool();

      const { rows: categories } = await pool.query(
        `SELECT id, name, emoji, sort_order
         FROM menu_categories
         WHERE club_id = $1 AND is_active = true
         ORDER BY sort_order ASC, name ASC`,
        [req.params.club_id]
      );

      const { rows: items } = await pool.query(
        `SELECT id, category_id, name, description, price_pence,
                image_url, is_available, is_featured, modifiers,
                sort_order, prep_time_mins
         FROM menu_items
         WHERE club_id = $1 AND category_id = ANY($2::uuid[])
         ORDER BY sort_order ASC, name ASC`,
        [req.params.club_id, categories.map((c: { id: string }) => c.id)]
      );

      const mapItem = (item: Record<string, unknown>) => ({
        id: item['id'],
        clubId: item['club_id'],
        categoryId: item['category_id'],
        name: item['name'],
        description: item['description'],
        pricePence: item['price_pence'],
        imageUrl: item['image_url'],
        isAvailable: item['is_available'],
        isFeatured: item['is_featured'],
        modifiers: item['modifiers'] ?? [],
        sortOrder: item['sort_order'],
        prepTimeMins: item['prep_time_mins'],
      });

      const mapCategory = (c: Record<string, unknown>) => ({
        id: c['id'],
        clubId: c['club_id'],
        name: c['name'],
        emoji: c['emoji'],
        sortOrder: c['sort_order'],
        isActive: c['is_active'] ?? true,
      });

      const itemsByCategory = new Map<string, ReturnType<typeof mapItem>[]>();
      for (const item of items) {
        const cat = item['category_id'] as string;
        if (!itemsByCategory.has(cat)) itemsByCategory.set(cat, []);
        itemsByCategory.get(cat)!.push(mapItem(item));
      }

      const categoriesWithItems = categories.map((c: Record<string, unknown>) => ({
        ...mapCategory(c),
        items: itemsByCategory.get(c['id'] as string) ?? [],
      }));

      // CDN-friendly caching: 60s fresh, 300s stale-while-revalidate
      reply.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

      return reply.send({
        data: { clubId: req.params.club_id, categories: categoriesWithItems },
        error: null,
      });
    }
  );
}
