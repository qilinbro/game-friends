import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const game = await (prisma as any).game.findUnique({
      where: { id },
      include: {
        rooms: {
          include: {
            players: true,
            _count: {
              select: { players: true },
            },
          },
        },
      },
    });

    if (!game) {
      return NextResponse.json({
        code: -1,
        message: '游戏不存在',
      }, { status: 404 });
    }

    return NextResponse.json({
      code: 0,
      data: game,
    });
  } catch (error) {
    console.error('获取游戏详情失败:', error);
    return NextResponse.json({
      code: -1,
      message: '获取游戏详情失败',
    }, { status: 500 });
  }
}
