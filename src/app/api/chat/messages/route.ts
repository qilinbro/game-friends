import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// 获取聊天消息
export async function GET(request: NextRequest) {
  try {
    const session = request.cookies.get('session')?.value;

    if (!session) {
      return NextResponse.json(
        { code: 401, message: '未登录', data: null },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get('gameId');
    const roomId = searchParams.get('roomId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // 构建查询条件
    const where: any = {
      userId: session,
    };

    if (gameId) {
      where.gameId = gameId;
    }

    if (roomId) {
      where.roomId = roomId;
    }

    // 获取消息
    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    });

    // 获取总数
    const total = await prisma.chatMessage.count({ where });

    return NextResponse.json({
      code: 0,
      data: {
        messages,
        total,
        limit,
        },
    });
  } catch (error) {
    console.error('获取聊天消息错误:', error);
    return NextResponse.json(
      { code: 500, message: '服务器错误', data: null },
      { status: 500 }
    );
  }
}

// 保存聊天消息
export async function POST(request: NextRequest) {
  try {
    const session = request.cookies.get('session')?.value;

    if (!session) {
      return NextResponse.json(
        { code: 401, message: '未登录', data: null },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { gameId, roomId, role, content } = body;

    if (!role || !content) {
      return NextResponse.json(
        { code: 400, message: '缺少必需字段', data: null },
        { status: 400 }
      );
    }

    // 保存消息
    const message = await prisma.chatMessage.create({
      data: {
        userId: session,
        gameId,
        roomId,
        role,
        content,
      },
    });

    return NextResponse.json({
      code: 0,
      data: message,
    });
  } catch (error) {
    console.error('保存聊天消息错误:', error);
    return NextResponse.json(
      { code: 500, message: '服务器错误', data: null },
      { status: 500 }
    );
  }
}
