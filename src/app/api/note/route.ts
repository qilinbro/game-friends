import { NextRequest, NextResponse } from 'next/server';
import { refreshAccessToken } from'@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// 添加笔记 API
export async function POST(request: NextRequest) {
  try {
    const session = request.cookies.get('session')?.value;

    if (!session) {
      return NextResponse.json(
        { code: 401, message: '未登录', data: null },
        { status: 401 }
      );
    }

    // 从数据库获取用户
    const user = await prisma.user.findUnique({
      where: { secondmeUserId: session },
    });

    if (!user) {
      return NextResponse.json(
        { code: 404, message: '用户不存在', data: null },
        { status: 404 }
      );
    }

    // 检查 token 是否过期
    if (new Date() >= user.tokenExpiresAt) {
      try {
        const tokenData = await refreshAccessToken(user.refreshToken);

        const { access_token, refresh_token, expires_in } = tokenData;
        const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);

        // 更新用户 token
        await prisma.user.update({
          where: { id: user.id },
          data: {
            accessToken: access_token,
            refreshToken: refresh_token,
            tokenExpiresAt,
          },
        });

        user.accessToken = access_token;
      } catch (refreshError) {
        console.error('Token 刷新失败:', refreshError);
        return NextResponse.json(
          { code: 401, message: '登录已过期，请重新登录', data: null },
          { status: 401 }
        );
      }
    }

    // 获取请求体
    const body = await request.json();
    const { content, target_user_id } = body;

    if (!content) {
      return NextResponse.json(
        { code: 400, message: '笔记内容不能为空', data: null },
        { status: 400 }
      );
    }

    // 先添加到 SecondMe
    const apiBaseUrl = process.env.SECONDME_API_BASE_URL!;
    const secondmeResponse = await fetch(`${apiBaseUrl}/api/secondme/note/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({
        content,
        target_user_id,
      }),
    });

    if (!secondmeResponse.ok) {
      const errorData = await secondmeResponse.json();
      return NextResponse.json(
        { code: 500, message: errorData.message || '添加笔记失败', data: null },
        { status: 500 }
      );
    }

    // 保存到本地数据库
    const note = await prisma.note.create({
      data: {
        userId: user.id,
        content,
        targetUserId: target_user_id,
      },
    });

    const result = await secondmeResponse.json();
    return NextResponse.json({
      ...result,
      data: {
        ...result.data,
        local_id: note.id,
      },
    });
  } catch (error) {
    console.error('添加笔记错误:', error);
    return NextResponse.json(
      { code: 500, message: '服务器错误', data: null },
      { status: 500 }
    );
  }
}

// 获取当前用户的笔记列表
export async function GET(request: NextRequest) {
  try {
    const session = request.cookies.get('session')?.value;

    if (!session) {
      return NextResponse.json(
        { code: 401, message: '未登录', data: null },
        { status: 401 }
      );
    }

    // 从数据库获取用户
    const user = await prisma.user.findUnique({
      where: { secondmeUserId: session },
    });

    if (!user) {
      return NextResponse.json(
        { code: 404, message: '用户不存在', data: null },
        { status: 404 }
      );
    }

    // 获取笔记列表
    const notes = await prisma.note.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      code: 0,
      data: {
        notes,
      },
    });
  } catch (error) {
    console.error('获取笔记列表错误:', error);
    return NextResponse.json(
      { code: 500, message: '服务器错误', data: null },
      { status: 500 }
    );
  }
}