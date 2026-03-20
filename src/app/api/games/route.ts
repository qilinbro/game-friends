import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const games = await prisma.game.findMany({
      include: {
        rooms: {
          include: {
            _count: {
              select: { players: true },
            },
          },
        },
      },
    });

    return NextResponse.json({
      code: 0,
      data: games,
    });
  } catch (error) {
    console.error('获取游戏列表失败:', error);
    return NextResponse.json({
      code: -1,
      message: '获取游戏列表失败',
    }, { status: 500 });
  }
}
