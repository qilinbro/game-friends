import { NextRequest, NextResponse } from 'next/server';
import { refreshAccessToken } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// 流式聊天 API
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
    const { message, sessionId, systemPrompt, enableWebSearch } = body;

    if (!message) {
      return NextResponse.json(
        { code: 400, message: '消息不能为空', data: null },
        { status: 400 }
      );
    }

    // 构建请求参数
    const apiBaseUrl = process.env.SECONDME_API_BASE_URL!;
    const requestBody: Record<string, any> = {
      message,
    };

    if (sessionId) {
      requestBody.sessionId = sessionId;
    }

    if (systemPrompt) {
      requestBody.systemPrompt = systemPrompt;
    }

    if (enableWebSearch !== undefined) {
      requestBody.enableWebSearch = enableWebSearch;
    }

    // 调用 SecondMe 流式聊天 API
    const response = await fetch(`${apiBaseUrl}/api/secondme/chat/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      return NextResponse.json(
        { code: 500, message: '聊天请求失败', data: null },
        { status: 500 }
      );
    }

    // 透传流式响应
    return new NextResponse(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('聊天错误:', error);
    return NextResponse.json(
      { code: 500, message: '服务器错误', data: null },
      { status: 500 }
    );
  }
}