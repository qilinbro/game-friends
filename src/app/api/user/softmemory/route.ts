import { NextRequest, NextResponse } from 'next/server';
import { refreshAccessToken } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// 获取用户软记忆
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

    // 获取查询参数
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword') || '';
    const pageNo = Math.max(1, parseInt(searchParams.get('pageNo') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));

    // 构建请求参数
    const apiBaseUrl = process.env.SECONDME_API_BASE_URL!;
    const params = new URLSearchParams();

    if (keyword) {
      params.append('keyword', keyword);
    }
    params.append('pageNo', pageNo.toString());
    params.append('pageSize', pageSize.toString());

    // 调用 SecondMe 软记忆 API
    const response = await fetch(`${apiBaseUrl}/api/secondme/user/softmemory?${params.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        {
          code: response.status,
          message: errorData.message || '获取软记忆失败',
          data: null,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('获取软记忆错误:', error);
    return NextResponse.json(
      { code: 500, message: '服务器错误', data: null },
      { status: 500 }
    );
  }
}
