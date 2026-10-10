import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ error: "Supabase environment variables are missing" }, { status: 500 });
    }

    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authorization.slice("Bearer ".length);
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (profileError) {
      return NextResponse.json({ error: "Could not read creator profile" }, { status: 500 });
    }
    if (profile?.role !== "creator" && profile?.role !== "admin") {
      return NextResponse.json({ error: "Creator access required" }, { status: 403 });
    }

    const body = await request.json() as { comicId?: string; chapterId?: string; pageId?: string; targetPageId?: string };
    if (!body.comicId || !body.chapterId || !body.pageId || !body.targetPageId || body.pageId === body.targetPageId) {
      return NextResponse.json({ error: "Two different pages are required" }, { status: 400 });
    }

    const { data: comic } = await supabase
      .from("comics")
      .select("id")
      .eq("id", body.comicId)
      .eq("creator_id", userData.user.id)
      .maybeSingle();
    if (!comic) {
      return NextResponse.json({ error: "Comic not found" }, { status: 404 });
    }

    const { data: pages, error: pagesError } = await supabase
      .from("pages")
      .select("id, page_number")
      .eq("chapter_id", body.chapterId)
      .order("page_number", { ascending: true });
    if (pagesError) {
      return NextResponse.json({ error: "Could not read chapter pages" }, { status: 500 });
    }

    const pageIndex = pages?.findIndex((page) => page.id === body.pageId) ?? -1;
    const targetIndex = pages?.findIndex((page) => page.id === body.targetPageId) ?? -1;
    if (pageIndex < 0 || targetIndex < 0) {
      return NextResponse.json({ error: "Page not found in this chapter" }, { status: 404 });
    }
    if (Math.abs(pageIndex - targetIndex) !== 1) {
      return NextResponse.json({ error: "Pages can only swap with an adjacent page" }, { status: 400 });
    }

    const page = pages![pageIndex];
    const targetPage = pages![targetIndex];
    const temporaryPageNumber = Math.max(...pages!.map((item) => item.page_number)) + 1;

    const { error: movePageError } = await supabase
      .from("pages")
      .update({ page_number: temporaryPageNumber })
      .eq("id", page.id)
      .eq("chapter_id", body.chapterId);
    if (movePageError) {
      return NextResponse.json({ error: movePageError.message }, { status: 500 });
    }

    const { error: moveTargetError } = await supabase
      .from("pages")
      .update({ page_number: page.page_number })
      .eq("id", targetPage.id)
      .eq("chapter_id", body.chapterId);
    if (moveTargetError) {
      const { error: rollbackError } = await supabase
        .from("pages")
        .update({ page_number: page.page_number })
        .eq("id", page.id)
        .eq("chapter_id", body.chapterId);
      return NextResponse.json({ error: rollbackError ? "Could not restore page order" : moveTargetError.message }, { status: 500 });
    }

    const { error: finalizeMoveError } = await supabase
      .from("pages")
      .update({ page_number: targetPage.page_number })
      .eq("id", page.id)
      .eq("chapter_id", body.chapterId);
    if (finalizeMoveError) {
      const { error: rollbackTargetError } = await supabase
        .from("pages")
        .update({ page_number: targetPage.page_number })
        .eq("id", targetPage.id)
        .eq("chapter_id", body.chapterId);
      const { error: rollbackPageError } = await supabase
        .from("pages")
        .update({ page_number: page.page_number })
        .eq("id", page.id)
        .eq("chapter_id", body.chapterId);
      return NextResponse.json({ error: rollbackTargetError || rollbackPageError ? "Could not restore page order" : finalizeMoveError.message }, { status: 500 });
    }

    return NextResponse.json({
      reordered: true,
      pages: [
        { id: page.id, page_number: targetPage.page_number },
        { id: targetPage.id, page_number: page.page_number },
      ],
    });
  } catch (error) {
    console.error("Page reorder error", error);
    return NextResponse.json({ error: "Could not reorder page" }, { status: 500 });
  }
}